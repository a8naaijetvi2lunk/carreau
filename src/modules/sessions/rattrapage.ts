/**
 * Rattrapages (spec §4.3 et §9.1 ; décisions D2 et D3 du plan du lot 7) : situation de chaque étudiant
 * face à un examen et à ses rattrapages, et création d'un rattrapage pour des absents. Le rattrapage
 * reprend l'instantané de sa session d'origine : les notes restent comparables.
 */
import "server-only";
import { and, eq, inArray, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db, type Executeur } from "@/db";
import { etudiant, participation, sessionAutorisation, sessionExamen, utilisateur } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { erreurs } from "@/lib/erreurs";
import { maintenant } from "@/lib/horloge";
import { genererJeton } from "@/lib/jetons";
import { LIMITES_SESSION, type StatutSession } from "@/lib/regles-session";
import { lireIdentifiant, valider } from "@/lib/validation";
import { journaliser, journaliserLesRefus } from "@/modules/journal";
import { parametresRgpdComplets } from "@/modules/parametres";
import { exigerPlaceLibre, lireCreneau, MESSAGES_SESSION } from "./commun";

export type SituationEtudiant =
  | { etat: "passe"; participationId: string; sessionId: string; statut: "en_cours" | "terminee" }
  | { etat: "prevu"; sessionId: string; statut: "attente" | "en_cours"; creneauPrevuLe: Date | null }
  | { etat: "absent" };

export type SaisieRattrapage = { sessionId: string; etudiantIds: string[]; creneauPrevu: string };

const CHOIX = { error: "Choisis au moins un étudiant." };
const schemaRattrapage = z.strictObject({
  sessionId: z.string(),
  etudiantIds: z
    .array(z.string(), CHOIX)
    .min(1, CHOIX)
    .max(LIMITES_SESSION.rattrapageMax, { error: `${LIMITES_SESSION.rattrapageMax} étudiants au plus.` }),
  creneauPrevu: z
    .string({ error: MESSAGES_SESSION.creneauInvalide })
    .max(40, { error: MESSAGES_SESSION.creneauInvalide }),
});

function ouverte(statut: StatutSession): statut is "attente" | "en_cours" {
  return statut === "attente" || statut === "en_cours";
}

/**
 * Situation de chaque étudiant actuel de la classe face à l'examen de la racine (session d'origine) et
 * de ses rattrapages (D2) : passé (participation en cours ou terminée dans la famille), rattrapage prévu
 * (autorisé dans un rattrapage en salle d'attente ou en cours), ou absent. Seul un absent est
 * rattrapable.
 */
export async function situationsExamen(
  executeur: Executeur,
  racine: { id: string; classeId: string },
): Promise<Map<string, SituationEtudiant>> {
  const famille = await executeur
    .select({
      id: sessionExamen.id,
      statut: sessionExamen.statut,
      creneauPrevuLe: sessionExamen.creneauPrevuLe,
    })
    .from(sessionExamen)
    .where(or(eq(sessionExamen.id, racine.id), eq(sessionExamen.sessionOrigineId, racine.id)));
  const passages = await executeur
    .select({
      id: participation.id,
      sessionId: participation.sessionId,
      etudiantId: participation.etudiantId,
      statut: participation.statut,
    })
    .from(participation)
    .where(
      and(
        inArray(
          participation.sessionId,
          famille.map((s) => s.id),
        ),
        ne(participation.statut, "attente"),
      ),
    );
  const ouvertes = famille.filter((s) => ouverte(s.statut));
  const autorisations =
    ouvertes.length === 0
      ? []
      : await executeur
          .select({ sessionId: sessionAutorisation.sessionId, etudiantId: sessionAutorisation.etudiantId })
          .from(sessionAutorisation)
          .where(
            inArray(
              sessionAutorisation.sessionId,
              ouvertes.map((s) => s.id),
            ),
          );
  const eleves = await executeur
    .select({ id: etudiant.id })
    .from(etudiant)
    .where(eq(etudiant.classeId, racine.classeId));
  const situations = new Map<string, SituationEtudiant>(eleves.map((e) => [e.id, { etat: "absent" }]));
  for (const a of autorisations) {
    const session = ouvertes.find((s) => s.id === a.sessionId);
    if (!session || !situations.has(a.etudiantId) || !ouverte(session.statut)) continue;
    situations.set(a.etudiantId, {
      etat: "prevu",
      sessionId: session.id,
      statut: session.statut,
      creneauPrevuLe: session.creneauPrevuLe,
    });
  }
  for (const p of passages) {
    if (!situations.has(p.etudiantId) || p.statut === "attente") continue;
    situations.set(p.etudiantId, {
      etat: "passe",
      participationId: p.id,
      sessionId: p.sessionId,
      statut: p.statut,
    });
  }
  return situations;
}

/**
 * Crée un rattrapage pour des absents d'une session terminée (D3) : instantané, visibilité, QCM et
 * classe copiés de l'origine ; une autorisation par étudiant choisi.
 */
export async function creerRattrapage(
  acteur: ActeurUtilisateur,
  saisie: SaisieRattrapage,
): Promise<{ id: string }> {
  return journaliserLesRefus(acteur, "sessions.creer_rattrapage", async () => {
    const donnees = valider(schemaRattrapage, saisie, "Rattrapage");
    const sessionId = lireIdentifiant(donnees.sessionId, "Session");
    const etudiantIds = [...new Set(donnees.etudiantIds.map((id) => lireIdentifiant(id, "Étudiant")))];
    const creneauPrevuLe = lireCreneau(donnees.creneauPrevu);
    return db().transaction(async (tx) => {
      // Sérialise les créations d'un même compte : la limite des sessions ouvertes reste juste.
      await tx
        .select({ id: utilisateur.id })
        .from(utilisateur)
        .where(eq(utilisateur.id, acteur.id))
        .for("update");
      // FOR UPDATE : deux rattrapages simultanés d'une même origine ne choisissent pas le même absent.
      const [origine] = await tx
        .select({
          id: sessionExamen.id,
          enseignantId: sessionExamen.enseignantId,
          qcmId: sessionExamen.qcmId,
          classeId: sessionExamen.classeId,
          type: sessionExamen.type,
          statut: sessionExamen.statut,
          contenu: sessionExamen.contenu,
          noteVisible: sessionExamen.noteVisible,
          correctionVisible: sessionExamen.correctionVisible,
        })
        .from(sessionExamen)
        .where(eq(sessionExamen.id, sessionId))
        .for("update");
      if (!origine) throw erreurs.introuvable("Session");
      if (origine.enseignantId !== acteur.id) throw erreurs.ressourceAutrui("Session");
      if (origine.type !== "classe") throw erreurs.etat(MESSAGES_SESSION.rattrapageDepuisOrigine);
      const contenu = origine.contenu;
      if (origine.statut !== "terminee" || contenu === null) {
        throw erreurs.etat(MESSAGES_SESSION.rattrapageAvantFin);
      }
      if (!(await parametresRgpdComplets())) throw erreurs.etat(MESSAGES_SESSION.rgpd);
      await exigerPlaceLibre(tx, acteur.id);
      const situations = await situationsExamen(tx, { id: origine.id, classeId: origine.classeId });
      if (etudiantIds.some((id) => situations.get(id)?.etat !== "absent")) {
        throw erreurs.etat(MESSAGES_SESSION.rattrapageEtudiants);
      }
      const [cree] = await tx
        .insert(sessionExamen)
        .values({
          qcmId: origine.qcmId,
          classeId: origine.classeId,
          enseignantId: acteur.id,
          type: "rattrapage",
          sessionOrigineId: origine.id,
          codeSecret: genererJeton(),
          creneauPrevuLe,
          noteVisible: origine.noteVisible,
          correctionVisible: origine.correctionVisible,
          contenu,
          creeLe: maintenant(),
        })
        .returning({ id: sessionExamen.id });
      if (!cree) throw new Error("Rattrapage non créé.");
      await tx
        .insert(sessionAutorisation)
        .values(etudiantIds.map((etudiantId) => ({ sessionId: cree.id, etudiantId })));
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "sessions.creer_rattrapage",
          cible: `session:${cree.id}`,
          details: { sessionOrigineId: origine.id, etudiants: etudiantIds.length },
        },
        tx,
      );
      return { id: cree.id };
    });
  });
}
