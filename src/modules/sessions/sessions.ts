/**
 * Sessions d'examen d'un compte (spec §4.3, §9.1 et §9.4 ; décisions D1 à D4 et D13 du plan du lot 4) :
 * options du formulaire, création, liste, lecture pour la page de pilotage, annulation.
 */
import "server-only";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { classe, etudiant, participation, qcm, question, sessionExamen, utilisateur } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { dateDepuisHeureDeParis } from "@/lib/dates";
import { erreurDepuisDetails, erreurs, type ErreurService } from "@/lib/erreurs";
import { maintenant } from "@/lib/horloge";
import { genererJeton } from "@/lib/jetons";
import { LIMITES_SESSION, type StatutSession } from "@/lib/regles-session";
import type { ResumeExamen } from "@/lib/resume-examen";
import { lireIdentifiant, valider } from "@/lib/validation";
import type { VueSuivi } from "@/lib/vue-session";
import { journaliser, journaliserLesRefus } from "@/modules/journal";
import { parametresRgpdComplets } from "@/modules/parametres";
import { MESSAGES_SESSION, resumeDuQcm, sessionDeLActeur } from "./commun";
import { construireSuivi } from "./suivi";

export type QcmProposable = {
  id: string;
  titre: string;
  nombreQuestions: number;
  noteVisibleDefaut: boolean;
  correctionVisibleDefaut: boolean;
};
export type ClasseProposable = { id: string; nom: string; effectif: number };
export type OptionsNouvelleSession = {
  qcm: QcmProposable[];
  classes: ClasseProposable[];
  rgpdComplet: boolean;
};

/** `creneauPrevu` : valeur d'un champ `datetime-local` (heure de Paris), chaîne vide sans créneau. */
export type SaisieSession = {
  qcmId: string;
  classeId: string;
  creneauPrevu: string;
  noteVisible: boolean;
  correctionVisible: boolean;
};

export type SessionResume = {
  id: string;
  titre: string;
  classe: string;
  statut: StatutSession;
  creneauPrevuLe: Date | null;
  creeLe: Date;
  demarreLe: Date | null;
  termineLe: Date | null;
  participants: number;
  effectif: number;
};

export type SessionDetaillee = {
  id: string;
  qcmId: string;
  titre: string;
  classe: string;
  statut: StatutSession;
  creneauPrevuLe: Date | null;
  noteVisible: boolean;
  correctionVisible: boolean;
  creeLe: Date;
  examen: ResumeExamen;
  suivi: VueSuivi;
};

/** Tri naturel en français, comme la liste des classes (« TD2 » avant « TD10 »). */
const COLLATEUR = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

const schemaCreation = z.strictObject({
  qcmId: z.string({ error: "Choisis un QCM." }),
  classeId: z.string({ error: "Choisis une classe." }),
  creneauPrevu: z
    .string({ error: MESSAGES_SESSION.creneauInvalide })
    .max(40, { error: MESSAGES_SESSION.creneauInvalide }),
  noteVisible: z.boolean({ error: "Réglage invalide." }),
  correctionVisible: z.boolean({ error: "Réglage invalide." }),
});
const schemaSession = z.strictObject({ sessionId: z.string() });

function erreurCreneau(message: string): ErreurService {
  return erreurDepuisDetails([{ chemin: "creneauPrevu", message }], "Session");
}

/** Créneau facultatif, lu en heure de Paris : 24 h dans le passé, 365 jours à l'avance au plus (D3). */
function lireCreneau(saisie: string): Date | null {
  const texte = saisie.trim();
  if (texte === "") return null;
  const date = dateDepuisHeureDeParis(texte);
  if (!date) throw erreurCreneau(MESSAGES_SESSION.creneauInvalide);
  const ecart = date.getTime() - maintenant().getTime();
  if (ecart < -LIMITES_SESSION.creneauPasseMaxMs) throw erreurCreneau(MESSAGES_SESSION.creneauPasse);
  if (ecart > LIMITES_SESSION.creneauFuturMaxMs) throw erreurCreneau(MESSAGES_SESSION.creneauLointain);
  return date;
}

/** QCM prêts et classes non archivées non vides de l'acteur : choix du formulaire de création (D18). */
export async function optionsNouvelleSession(acteur: ActeurUtilisateur): Promise<OptionsNouvelleSession> {
  return journaliserLesRefus(acteur, "sessions.options", async () => {
    const qcmPrets = await db()
      .select({
        id: qcm.id,
        titre: qcm.titre,
        nombreQuestions: count(question.id),
        noteVisibleDefaut: qcm.noteVisibleDefaut,
        correctionVisibleDefaut: qcm.correctionVisibleDefaut,
      })
      .from(qcm)
      .leftJoin(question, eq(question.qcmId, qcm.id))
      .where(and(eq(qcm.enseignantId, acteur.id), eq(qcm.statut, "pret")))
      .groupBy(qcm.id)
      .orderBy(desc(qcm.modifieLe));
    const classes = await db()
      .select({ id: classe.id, nom: classe.nom, effectif: count(etudiant.id) })
      .from(classe)
      .innerJoin(etudiant, eq(etudiant.classeId, classe.id))
      .where(and(eq(classe.enseignantId, acteur.id), eq(classe.archivee, false)))
      .groupBy(classe.id);
    return {
      qcm: qcmPrets,
      classes: classes.sort((a, b) => COLLATEUR.compare(a.nom, b.nom)),
      rgpdComplet: await parametresRgpdComplets(),
    };
  });
}

/** Crée une session en salle d'attente (décision D3). */
export async function creerSession(
  acteur: ActeurUtilisateur,
  saisie: SaisieSession,
): Promise<{ id: string }> {
  return journaliserLesRefus(acteur, "sessions.creer", async () => {
    const donnees = valider(schemaCreation, saisie, "Session");
    const qcmId = lireIdentifiant(donnees.qcmId, "QCM");
    const classeId = lireIdentifiant(donnees.classeId, "Classe");
    const creneauPrevuLe = lireCreneau(donnees.creneauPrevu);
    return db().transaction(async (tx) => {
      // Sérialise les créations d'un même compte : la limite des sessions ouvertes reste juste en concurrence.
      await tx
        .select({ id: utilisateur.id })
        .from(utilisateur)
        .where(eq(utilisateur.id, acteur.id))
        .for("update");
      const [lu] = await tx
        .select({ enseignantId: qcm.enseignantId, statut: qcm.statut })
        .from(qcm)
        .where(eq(qcm.id, qcmId))
        .for("share");
      if (!lu) throw erreurs.introuvable("QCM");
      if (lu.enseignantId !== acteur.id) throw erreurs.ressourceAutrui("QCM");
      const [laClasse] = await tx
        .select({ enseignantId: classe.enseignantId, archivee: classe.archivee })
        .from(classe)
        .where(eq(classe.id, classeId))
        .for("share");
      if (!laClasse) throw erreurs.introuvable("Classe");
      if (laClasse.enseignantId !== acteur.id) throw erreurs.ressourceAutrui("Classe");
      if (lu.statut !== "pret") throw erreurs.etat(MESSAGES_SESSION.qcmPasPret);
      if (laClasse.archivee) throw erreurs.etat(MESSAGES_SESSION.classeArchivee);
      const [effectif] = await tx
        .select({ total: count() })
        .from(etudiant)
        .where(eq(etudiant.classeId, classeId));
      if ((effectif?.total ?? 0) === 0) throw erreurs.etat(MESSAGES_SESSION.classeVide);
      if (!(await parametresRgpdComplets())) throw erreurs.etat(MESSAGES_SESSION.rgpd);
      const [ouvertes] = await tx
        .select({ total: count() })
        .from(sessionExamen)
        .where(
          and(
            eq(sessionExamen.enseignantId, acteur.id),
            inArray(sessionExamen.statut, ["attente", "en_cours"]),
          ),
        );
      if ((ouvertes?.total ?? 0) >= LIMITES_SESSION.ouvertesParCompte)
        throw erreurs.etat(MESSAGES_SESSION.limite);
      const [creee] = await tx
        .insert(sessionExamen)
        .values({
          qcmId,
          classeId,
          enseignantId: acteur.id,
          codeSecret: genererJeton(),
          creneauPrevuLe,
          noteVisible: donnees.noteVisible,
          correctionVisible: donnees.correctionVisible,
          creeLe: maintenant(),
        })
        .returning({ id: sessionExamen.id });
      if (!creee) throw new Error("Session non créée.");
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "sessions.creer",
          cible: `session:${creee.id}`,
          details: { qcmId, classeId },
        },
        tx,
      );
      return { id: creee.id };
    });
  });
}

const RANG_STATUT: Record<StatutSession, number> = { en_cours: 0, attente: 1, terminee: 2, annulee: 2 };

function dateDeReference(s: SessionResume): Date {
  return s.termineLe ?? s.demarreLe ?? s.creeLe;
}

/** En cours, puis en salle d'attente (créneau le plus proche, sans créneau ensuite), puis passées (récentes d'abord). */
function comparerSessions(a: SessionResume, b: SessionResume): number {
  const rang = RANG_STATUT[a.statut] - RANG_STATUT[b.statut];
  if (rang !== 0) return rang;
  if (a.statut === "attente") {
    const ecart =
      (a.creneauPrevuLe?.getTime() ?? Number.MAX_SAFE_INTEGER) -
      (b.creneauPrevuLe?.getTime() ?? Number.MAX_SAFE_INTEGER);
    return ecart !== 0 ? ecart : b.creeLe.getTime() - a.creeLe.getTime();
  }
  return dateDeReference(b).getTime() - dateDeReference(a).getTime();
}

/** Toutes les sessions de l'acteur, avec leurs participants et l'effectif de leur classe. */
export async function listerSessions(acteur: ActeurUtilisateur): Promise<SessionResume[]> {
  return journaliserLesRefus(acteur, "sessions.lister", async () => {
    // Requête avec jointures : les colonnes des sous-requêtes restent qualifiées (piège DevBrain).
    const lignes = await db()
      .select({
        id: sessionExamen.id,
        titre: qcm.titre,
        classe: classe.nom,
        statut: sessionExamen.statut,
        creneauPrevuLe: sessionExamen.creneauPrevuLe,
        creeLe: sessionExamen.creeLe,
        demarreLe: sessionExamen.demarreLe,
        termineLe: sessionExamen.termineLe,
        participants:
          sql<number>`(select count(*) from ${participation} where ${participation.sessionId} = ${sessionExamen.id})`.mapWith(
            Number,
          ),
        effectif:
          sql<number>`(select count(*) from ${etudiant} where ${etudiant.classeId} = ${sessionExamen.classeId})`.mapWith(
            Number,
          ),
      })
      .from(sessionExamen)
      .innerJoin(qcm, eq(qcm.id, sessionExamen.qcmId))
      .innerJoin(classe, eq(classe.id, sessionExamen.classeId))
      .where(eq(sessionExamen.enseignantId, acteur.id));
    return lignes.sort(comparerSessions);
  });
}

/** Une session de l'acteur : en-tête, résumé de l'examen et suivi de la salle (page de pilotage). */
export async function lireSession(
  acteur: ActeurUtilisateur,
  saisie: { sessionId: string },
): Promise<SessionDetaillee> {
  return journaliserLesRefus(acteur, "sessions.lire", async () => {
    const sessionId = lireIdentifiant(valider(schemaSession, saisie, "Session").sessionId, "Session");
    const lue = await sessionDeLActeur(db(), acteur, sessionId);
    const [infos] = await db()
      .select({
        titre: qcm.titre,
        classe: classe.nom,
        creneauPrevuLe: sessionExamen.creneauPrevuLe,
        noteVisible: sessionExamen.noteVisible,
        correctionVisible: sessionExamen.correctionVisible,
        creeLe: sessionExamen.creeLe,
      })
      .from(sessionExamen)
      .innerJoin(qcm, eq(qcm.id, sessionExamen.qcmId))
      .innerJoin(classe, eq(classe.id, sessionExamen.classeId))
      .where(eq(sessionExamen.id, sessionId));
    if (!infos) throw erreurs.introuvable("Session");
    return {
      id: lue.id,
      qcmId: lue.qcmId,
      statut: lue.statut,
      ...infos,
      examen: await resumeDuQcm(db(), lue.qcmId, false),
      suivi: await construireSuivi(db(), lue),
    };
  });
}

/**
 * Annule une session en salle d'attente (décision D13) et supprime ses participations : leurs
 * étudiants redeviennent retirables de leur classe.
 */
export async function annulerSession(
  acteur: ActeurUtilisateur,
  saisie: { sessionId: string },
): Promise<void> {
  return journaliserLesRefus(acteur, "sessions.annuler", async () => {
    const sessionId = lireIdentifiant(valider(schemaSession, saisie, "Session").sessionId, "Session");
    await db().transaction(async (tx) => {
      const lue = await sessionDeLActeur(tx, acteur, sessionId, true);
      if (lue.statut !== "attente") throw erreurs.etat(MESSAGES_SESSION.annulationImpossible);
      const retirees = await tx
        .delete(participation)
        .where(eq(participation.sessionId, sessionId))
        .returning({ id: participation.id });
      await tx
        .update(sessionExamen)
        .set({ statut: "annulee", termineLe: maintenant() })
        .where(eq(sessionExamen.id, sessionId));
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "sessions.annuler",
          cible: `session:${sessionId}`,
          details: { participantsRetires: retirees.length },
        },
        tx,
      );
    });
  });
}
