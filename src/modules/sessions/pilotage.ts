/**
 * Pilotage d'une session par son enseignant (spec §6.2 et §6.3 ; décisions D10, D12, D13 et D14 du
 * plan du lot 4) : démarrage commun, retrait d'un participant, décision sur une demande d'appareil.
 */
import "server-only";
import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { db, type Transaction } from "@/db";
import { demandeAppareil, evenement, participation, qcm, sessionExamen } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { erreurs } from "@/lib/erreurs";
import { maintenant } from "@/lib/horloge";
import { LIMITES_SESSION, type StatutDemande, type StatutSession } from "@/lib/regles-session";
import { lireIdentifiant, valider } from "@/lib/validation";
import { cloturerSiFinie, preparerDepart, prolongerPassages } from "@/modules/examen";
import { journaliser, journaliserLesRefus } from "@/modules/journal";
import { parametresRgpdComplets } from "@/modules/parametres";
import { MESSAGES_SESSION, messageStatut, sessionDeLActeur } from "./commun";

const schemaSession = z.strictObject({ sessionId: z.string() });
const schemaParticipation = z.strictObject({ participationId: z.string() });
const schemaDemande = z.strictObject({ demandeId: z.string() });

const DUREE_PROLONGATION = { error: "Choisis une durée de 1 à 60 minutes." };
const schemaProlonger = z.strictObject({
  sessionId: z.string(),
  minutes: z.int(DUREE_PROLONGATION).min(1, DUREE_PROLONGATION).max(60, DUREE_PROLONGATION),
});

/**
 * « Démarrer » (spec §6.3, décision D12) : tout le monde commence dans 5 s. Le départ fige
 * l'instantané et prépare le passage de chacun (lot 5).
 */
export async function demarrerSession(
  acteur: ActeurUtilisateur,
  saisie: { sessionId: string },
): Promise<{ demarreLe: Date }> {
  return journaliserLesRefus(acteur, "sessions.demarrer", async () => {
    const sessionId = lireIdentifiant(valider(schemaSession, saisie, "Session").sessionId, "Session");
    return db().transaction(async (tx) => {
      // FOR UPDATE : les réclamations en cours (FOR SHARE) aboutissent d'abord (décision D14).
      const lue = await sessionDeLActeur(tx, acteur, sessionId, true);
      if (lue.statut !== "attente") throw erreurs.etat(messageStatut(lue.statut));
      // Un rattrapage démarre sur l'instantané de son origine : le QCM peut avoir changé (D4 du lot 7).
      if (lue.type === "classe") {
        const [leQcm] = await tx
          .select({ statut: qcm.statut })
          .from(qcm)
          .where(eq(qcm.id, lue.qcmId))
          .for("share");
        if (leQcm?.statut !== "pret") throw erreurs.etat(MESSAGES_SESSION.qcmPlusPret);
      }
      if (!(await parametresRgpdComplets())) throw erreurs.etat(MESSAGES_SESSION.rgpd);
      const [inscrits] = await tx
        .select({ total: count() })
        .from(participation)
        .where(eq(participation.sessionId, sessionId));
      const participants = inscrits?.total ?? 0;
      if (participants === 0) throw erreurs.etat(MESSAGES_SESSION.aucunParticipant);
      const demarreLe = new Date(maintenant().getTime() + LIMITES_SESSION.delaiDemarrageMs);
      await tx
        .update(sessionExamen)
        .set({ statut: "en_cours", demarreLe })
        .where(eq(sessionExamen.id, sessionId));
      // Instantané, ordres et échéances de chaque participation (spec §6.3, lot 5).
      const { questions } = await preparerDepart(tx, { sessionId, qcmId: lue.qcmId, demarreLe });
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "sessions.demarrer",
          cible: `session:${sessionId}`,
          details: { participants, questions },
        },
        tx,
      );
      return { demarreLe };
    });
  });
}

/** Retire un participant de la salle d'attente (décision D13), avec ses demandes et ses événements. */
export async function retirerParticipant(
  acteur: ActeurUtilisateur,
  saisie: { participationId: string },
): Promise<void> {
  return journaliserLesRefus(acteur, "sessions.retirer_participant", async () => {
    const participationId = lireIdentifiant(
      valider(schemaParticipation, saisie, "Participant").participationId,
      "Participant",
    );
    await db().transaction(async (tx) => {
      const [proprietaire] = await tx
        .select({ sessionId: participation.sessionId, enseignantId: sessionExamen.enseignantId })
        .from(participation)
        .innerJoin(sessionExamen, eq(sessionExamen.id, participation.sessionId))
        .where(eq(participation.id, participationId));
      if (!proprietaire) throw erreurs.introuvable("Participant");
      if (proprietaire.enseignantId !== acteur.id) throw erreurs.ressourceAutrui("Participant");
      const lue = await sessionDeLActeur(tx, acteur, proprietaire.sessionId, true);
      if (lue.statut !== "attente") throw erreurs.etat(MESSAGES_SESSION.retraitImpossible);
      const retirees = await tx
        .delete(participation)
        .where(eq(participation.id, participationId))
        .returning({ id: participation.id });
      // Retiré par un autre onglet entre la lecture et le verrou.
      if (retirees.length === 0) throw erreurs.introuvable("Participant");
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "sessions.retirer_participant",
          cible: `participation:${participationId}`,
          details: { sessionId: lue.id },
        },
        tx,
      );
    });
  });
}

type DemandeLue = {
  id: string;
  participationId: string;
  jetonHash: string;
  statut: StatutDemande;
  creeLe: Date;
  appareilJetonHash: string;
  statutSession: StatutSession;
};

/**
 * Demande d'une session de l'acteur, verrouillée dans l'ordre de la réclamation : participation, puis
 * demande (décision D14). Demande d'un autre compte : « Demande introuvable. », refus journalisé.
 */
async function demandeDeLActeur(
  tx: Transaction,
  acteur: ActeurUtilisateur,
  demandeId: string,
): Promise<DemandeLue> {
  const [proprietaire] = await tx
    .select({
      participationId: demandeAppareil.participationId,
      sessionId: sessionExamen.id,
      enseignantId: sessionExamen.enseignantId,
    })
    .from(demandeAppareil)
    .innerJoin(participation, eq(participation.id, demandeAppareil.participationId))
    .innerJoin(sessionExamen, eq(sessionExamen.id, participation.sessionId))
    .where(eq(demandeAppareil.id, demandeId));
  if (!proprietaire) throw erreurs.introuvable("Demande");
  if (proprietaire.enseignantId !== acteur.id) throw erreurs.ressourceAutrui("Demande");
  const [p] = await tx
    .select({ appareilJetonHash: participation.appareilJetonHash })
    .from(participation)
    .where(eq(participation.id, proprietaire.participationId))
    .for("update");
  const [d] = await tx
    .select({
      id: demandeAppareil.id,
      participationId: demandeAppareil.participationId,
      jetonHash: demandeAppareil.jetonHash,
      statut: demandeAppareil.statut,
      creeLe: demandeAppareil.creeLe,
    })
    .from(demandeAppareil)
    .where(eq(demandeAppareil.id, demandeId))
    .for("update");
  const [s] = await tx
    .select({ statut: sessionExamen.statut })
    .from(sessionExamen)
    .where(eq(sessionExamen.id, proprietaire.sessionId));
  // Participant retiré par un autre onglet entre la lecture et les verrous.
  if (!p || !d || !s) throw erreurs.introuvable("Demande");
  return { ...d, appareilJetonHash: p.appareilJetonHash, statutSession: s.statut };
}

/** Une demande ne se décide qu'en attente, avant son expiration, dans une session ouverte (D10, D20). */
function exigerDecidable(d: DemandeLue): void {
  if (d.statutSession === "terminee" || d.statutSession === "annulee") {
    throw erreurs.etat(messageStatut(d.statutSession));
  }
  if (d.statut !== "en_attente") throw erreurs.etat(MESSAGES_SESSION.demandeTraitee);
  if (maintenant().getTime() - d.creeLe.getTime() >= LIMITES_SESSION.dureeDemandeMs) {
    throw erreurs.etat(MESSAGES_SESSION.demandeExpiree);
  }
}

/** « Autoriser » : le nouveau téléphone prend la participation, l'ancien est révoqué (spec §6.2). */
export async function autoriserDemande(
  acteur: ActeurUtilisateur,
  saisie: { demandeId: string },
): Promise<void> {
  return journaliserLesRefus(acteur, "sessions.autoriser_appareil", async () => {
    const demandeId = lireIdentifiant(valider(schemaDemande, saisie, "Demande").demandeId, "Demande");
    await db().transaction(async (tx) => {
      const d = await demandeDeLActeur(tx, acteur, demandeId);
      exigerDecidable(d);
      await tx
        .update(participation)
        .set({ appareilJetonHash: d.jetonHash })
        .where(eq(participation.id, d.participationId));
      await tx
        .update(demandeAppareil)
        .set({
          statut: "autorisee",
          traiteeLe: maintenant(),
          traiteePar: acteur.id,
          ancienJetonHash: d.appareilJetonHash,
        })
        .where(eq(demandeAppareil.id, d.id));
      // Signal serveur de la reprise autorisée : la demande et l'absence qui l'entoure ne comptent pas (A3 du lot 7).
      await tx.insert(evenement).values({
        participationId: d.participationId,
        type: "appareil_autorise",
        recuLe: maintenant(),
        details: {},
      });
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "sessions.autoriser_appareil",
          cible: `demande:${d.id}`,
          details: { participationId: d.participationId },
        },
        tx,
      );
    });
  });
}

/** « Refuser » : la participation garde son téléphone ; le demandeur voit le refus (décision D10). */
export async function refuserDemande(
  acteur: ActeurUtilisateur,
  saisie: { demandeId: string },
): Promise<void> {
  return journaliserLesRefus(acteur, "sessions.refuser_appareil", async () => {
    const demandeId = lireIdentifiant(valider(schemaDemande, saisie, "Demande").demandeId, "Demande");
    await db().transaction(async (tx) => {
      const d = await demandeDeLActeur(tx, acteur, demandeId);
      exigerDecidable(d);
      await tx
        .update(demandeAppareil)
        .set({ statut: "refusee", traiteeLe: maintenant(), traiteePar: acteur.id })
        .where(eq(demandeAppareil.id, d.id));
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "sessions.refuser_appareil",
          cible: `demande:${d.id}`,
          details: { participationId: d.participationId },
        },
        tx,
      );
    });
  });
}

/** Examen en cours seulement : en salle d'attente, « pas encore démarré » ; sinon, le message du statut. */
function exigerEnCours(statut: StatutSession): void {
  if (statut === "attente") throw erreurs.etat(MESSAGES_SESSION.pasDemarree);
  if (statut !== "en_cours") throw erreurs.etat(messageStatut(statut));
}

/**
 * « Prolonger » (spec §6.5, décision D12 du plan du lot 6) : chrono global seulement. La session est
 * verrouillée, puis chaque passage en cours (module examen).
 */
export async function prolongerSession(
  acteur: ActeurUtilisateur,
  saisie: { sessionId: string; minutes: number },
): Promise<{ participants: number }> {
  return journaliserLesRefus(acteur, "sessions.prolonger", async () => {
    const donnees = valider(schemaProlonger, saisie, "Prolongation");
    const sessionId = lireIdentifiant(donnees.sessionId, "Session");
    return db().transaction(async (tx) => {
      const lue = await sessionDeLActeur(tx, acteur, sessionId, true);
      exigerEnCours(lue.statut);
      const participants = await prolongerPassages(tx, sessionId, donnees.minutes, maintenant());
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "sessions.prolonger",
          cible: `session:${sessionId}`,
          details: { minutes: donnees.minutes, participants },
        },
        tx,
      );
      return { participants };
    });
  });
}

/**
 * « Terminer pour tous » (spec §6.5, décision D13 du plan du lot 6) : chaque passage ouvert est clos
 * comme à l'échéance globale, puis la session (module examen, clôture forcée).
 */
export async function terminerSession(
  acteur: ActeurUtilisateur,
  saisie: { sessionId: string },
): Promise<{ participants: number }> {
  return journaliserLesRefus(acteur, "sessions.terminer", async () => {
    const sessionId = lireIdentifiant(valider(schemaSession, saisie, "Session").sessionId, "Session");
    const lue = await sessionDeLActeur(db(), acteur, sessionId);
    exigerEnCours(lue.statut);
    if (!(await cloturerSiFinie(sessionId, maintenant(), { forcer: true }))) {
      // Close entre la lecture et le verrou (autre onglet, ou clôture automatique).
      throw erreurs.etat(MESSAGES_SESSION.terminee);
    }
    const [inscrits] = await db()
      .select({ total: count() })
      .from(participation)
      .where(eq(participation.sessionId, sessionId));
    const participants = inscrits?.total ?? 0;
    await journaliser({
      acteur: { type: "utilisateur", id: acteur.id },
      action: "sessions.terminer",
      cible: `session:${sessionId}`,
      details: { participants },
    });
    return { participants };
  });
}
