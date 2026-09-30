/**
 * Jetons MCP d'un compte (spec §10 ; décision D3 du plan du lot 8) : création (jeton montré une seule
 * fois), liste des jetons actifs, révocation. Seule l'empreinte SHA-256 du jeton est en base ; ni le
 * jeton ni son nom n'entrent au journal. Ouverts à tous les rôles : chaque compte a ses QCM.
 */
import "server-only";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { jetonMcp, utilisateur } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { erreurs } from "@/lib/erreurs";
import { maintenant } from "@/lib/horloge";
import { genererJeton, sha256Hex } from "@/lib/jetons";
import {
  LIMITES_JETONS_MCP,
  MESSAGE_LIMITE_JETONS,
  PORTEES_MCP,
  PREFIXE_JETON_MCP,
  prefixeJetonMcp,
  type PorteeMcp,
} from "@/lib/regles-mcp";
import { lireIdentifiant, valider } from "@/lib/validation";
import { journaliser, journaliserLesRefus } from "@/modules/journal";

export type JetonMcpCree = { id: string; nom: string; portee: PorteeMcp; jeton: string };

export type JetonMcpResume = {
  id: string;
  nom: string;
  prefixe: string;
  portee: PorteeMcp;
  creeLe: Date;
  dernierUsageLe: Date | null;
};

export const MESSAGE_JETONS_DEPUIS_CARREAU =
  "Les jetons MCP se gèrent depuis Carreau, pas depuis un assistant.";

const schemaNom = z
  .string({ error: "Le nom du jeton est obligatoire." })
  .transform((valeur) => valeur.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(1, { error: "Le nom du jeton est obligatoire." })
      .max(LIMITES_JETONS_MCP.nomMax, {
        error: `Le nom du jeton dépasse ${LIMITES_JETONS_MCP.nomMax} caractères.`,
      })
      .regex(/^[^\p{Cc}]*$/u, { error: "Le nom du jeton contient des caractères non autorisés." }),
  );

const schemaCreation = z.strictObject({
  nom: schemaNom,
  portee: z.enum(PORTEES_MCP, { error: "Portée inconnue." }),
});
const schemaRevocation = z.strictObject({ jetonId: z.string() });

/** Un jeton ne crée, ne liste ni ne révoque d'autres jetons : seule l'interface les gère. */
function exigerInterface(acteur: ActeurUtilisateur): void {
  if (acteur.jetonMcp) throw erreurs.accesRefuse(MESSAGE_JETONS_DEPUIS_CARREAU);
}

/** Crée un jeton ; le jeton en clair n'est renvoyé qu'ici, une seule fois. */
export async function creerJetonMcp(
  acteur: ActeurUtilisateur,
  saisie: { nom: string; portee: string },
): Promise<JetonMcpCree> {
  return journaliserLesRefus(acteur, "mcp.creer_jeton", async () => {
    exigerInterface(acteur);
    const { nom, portee } = valider(schemaCreation, saisie, "Jeton");
    return db().transaction(async (tx) => {
      // Sérialise les créations d'un même compte : la limite des jetons actifs reste juste en concurrence.
      await tx
        .select({ id: utilisateur.id })
        .from(utilisateur)
        .where(eq(utilisateur.id, acteur.id))
        .for("update");
      const [actifs] = await tx
        .select({ total: count() })
        .from(jetonMcp)
        .where(and(eq(jetonMcp.enseignantId, acteur.id), isNull(jetonMcp.revoqueLe)));
      if ((actifs?.total ?? 0) >= LIMITES_JETONS_MCP.actifsMax) throw erreurs.etat(MESSAGE_LIMITE_JETONS);
      const jeton = `${PREFIXE_JETON_MCP}${genererJeton()}`;
      const [cree] = await tx
        .insert(jetonMcp)
        .values({
          enseignantId: acteur.id,
          nom,
          prefixe: prefixeJetonMcp(jeton),
          jetonHash: sha256Hex(jeton),
          portee,
          creeLe: maintenant(),
        })
        .returning({ id: jetonMcp.id });
      if (!cree) throw new Error("Jeton non créé.");
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "mcp.creer_jeton",
          cible: `jeton:${cree.id}`,
          details: { portee },
        },
        tx,
      );
      return { id: cree.id, nom, portee, jeton };
    });
  });
}

/** Jetons actifs de l'acteur, du plus récent au plus ancien. */
export async function listerJetonsMcp(acteur: ActeurUtilisateur): Promise<JetonMcpResume[]> {
  return journaliserLesRefus(acteur, "mcp.lister_jetons", async () => {
    exigerInterface(acteur);
    return db()
      .select({
        id: jetonMcp.id,
        nom: jetonMcp.nom,
        prefixe: jetonMcp.prefixe,
        portee: jetonMcp.portee,
        creeLe: jetonMcp.creeLe,
        dernierUsageLe: jetonMcp.dernierUsageLe,
      })
      .from(jetonMcp)
      .where(and(eq(jetonMcp.enseignantId, acteur.id), isNull(jetonMcp.revoqueLe)))
      .orderBy(desc(jetonMcp.creeLe), desc(jetonMcp.id));
  });
}

/** Révoque un jeton de l'acteur ; un jeton déjà révoqué reste tel quel, sans erreur. */
export async function revoquerJetonMcp(
  acteur: ActeurUtilisateur,
  saisie: { jetonId: string },
): Promise<void> {
  return journaliserLesRefus(acteur, "mcp.revoquer_jeton", async () => {
    exigerInterface(acteur);
    const jetonId = lireIdentifiant(valider(schemaRevocation, saisie, "Jeton").jetonId, "Jeton");
    await db().transaction(async (tx) => {
      const [ligne] = await tx
        .select({ enseignantId: jetonMcp.enseignantId, revoqueLe: jetonMcp.revoqueLe })
        .from(jetonMcp)
        .where(eq(jetonMcp.id, jetonId))
        .for("update");
      if (!ligne) throw erreurs.introuvable("Jeton");
      if (ligne.enseignantId !== acteur.id) throw erreurs.ressourceAutrui("Jeton");
      if (ligne.revoqueLe !== null) return;
      await tx.update(jetonMcp).set({ revoqueLe: maintenant() }).where(eq(jetonMcp.id, jetonId));
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "mcp.revoquer_jeton",
          cible: `jeton:${jetonId}`,
        },
        tx,
      );
    });
  });
}
