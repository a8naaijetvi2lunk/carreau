/** Données de test du MCP (base isolée) : jetons insérés directement, acteur d'un appel MCP. */
import { db } from "@/db";
import { jetonMcp, type utilisateur } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { maintenant } from "@/lib/horloge";
import { genererJeton, sha256Hex } from "@/lib/jetons";
import { PREFIXE_JETON_MCP, prefixeJetonMcp, type PorteeMcp } from "@/lib/regles-mcp";
import { acteurDe, exiger } from "./comptes";

let compteur = 0;

/** Jeton MCP de `enseignantId`, écrit comme le ferait `creerJetonMcp` ; renvoie sa ligne et le jeton en clair. */
export async function creerJetonMcpTest(
  enseignantId: string,
  options: { portee?: PorteeMcp; revoque?: boolean; nom?: string; dernierUsageLe?: Date | null } = {},
) {
  compteur += 1;
  const jeton = `${PREFIXE_JETON_MCP}${genererJeton()}`;
  const [cree] = await db()
    .insert(jetonMcp)
    .values({
      enseignantId,
      nom: options.nom ?? `Jeton ${compteur}`,
      prefixe: prefixeJetonMcp(jeton),
      jetonHash: sha256Hex(jeton),
      portee: options.portee ?? "ecriture",
      creeLe: maintenant(),
      dernierUsageLe: options.dernierUsageLe ?? null,
      revoqueLe: options.revoque ? maintenant() : null,
    })
    .returning();
  return { ...exiger(cree, "jeton MCP"), jeton };
}

/** Acteur d'un appel MCP du compte `u` (décision D2 du plan du lot 8). */
export function acteurMcpDe(
  u: typeof utilisateur.$inferSelect,
  portee: PorteeMcp = "ecriture",
  jetonId = "00000000-0000-4000-8000-000000000001",
): ActeurUtilisateur {
  return { ...acteurDe(u), sessionId: null, jetonMcp: { id: jetonId, portee } };
}
