/**
 * Vérification du jeton Bearer d'une requête MCP (spec §10 ; décision D4 du plan du lot 8), appelée par
 * le serveur avant `withMcpAuth`. Un en-tête absent ou mal formé ne déclenche aucune requête. Le jeton
 * est retrouvé par son empreinte ; un jeton révoqué ou le jeton d'un compte désactivé ne vaut rien.
 */
import "server-only";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { jetonMcp, utilisateur } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { maintenant } from "@/lib/horloge";
import { sha256Hex } from "@/lib/jetons";
import { INTERVALLE_USAGE_JETON_MS, lireJetonBearer } from "@/lib/regles-mcp";

/** Acteur d'un appel MCP (`sessionId` nul, `jetonMcp` renseigné), ou null. */
export async function verifierJetonMcp(entete: string | null): Promise<ActeurUtilisateur | null> {
  const jeton = lireJetonBearer(entete);
  if (jeton === null) return null;
  const [ligne] = await db()
    .select({
      jetonId: jetonMcp.id,
      portee: jetonMcp.portee,
      revoqueLe: jetonMcp.revoqueLe,
      utilisateurId: utilisateur.id,
      email: utilisateur.email,
      nom: utilisateur.nom,
      prenom: utilisateur.prenom,
      role: utilisateur.role,
      actif: utilisateur.actif,
    })
    .from(jetonMcp)
    .innerJoin(utilisateur, eq(utilisateur.id, jetonMcp.enseignantId))
    .where(eq(jetonMcp.jetonHash, sha256Hex(jeton)))
    .limit(1);
  if (!ligne || ligne.revoqueLe !== null || !ligne.actif) return null;

  const instant = maintenant();
  await db()
    .update(jetonMcp)
    .set({ dernierUsageLe: instant })
    .where(
      and(
        eq(jetonMcp.id, ligne.jetonId),
        or(
          isNull(jetonMcp.dernierUsageLe),
          lt(jetonMcp.dernierUsageLe, new Date(instant.getTime() - INTERVALLE_USAGE_JETON_MS)),
        ),
      ),
    );

  return {
    type: "utilisateur",
    id: ligne.utilisateurId,
    sessionId: null,
    jetonMcp: { id: ligne.jetonId, portee: ligne.portee },
    email: ligne.email,
    nom: ligne.nom,
    prenom: ligne.prenom,
    role: ligne.role,
  };
}
