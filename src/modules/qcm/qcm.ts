/**
 * QCM d'un compte (spec §4.2 et §9.1 ; décisions D1, D3, D5, D9, D12, D15 et D16 du plan du lot 3) :
 * création, lecture pour l'éditeur, paramètres et statuts. Toute écriture verrouille le QCM.
 */
import "server-only";
import { count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, type Transaction } from "@/db";
import { qcm, question, utilisateur } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { erreurs } from "@/lib/erreurs";
import { maintenant } from "@/lib/horloge";
import {
  LIMITES_QCM,
  MESSAGE_DUREE_GLOBALE,
  MESSAGE_DUREE_QUESTION,
  MODES_CHRONO,
  problemeDureeGlobaleMinutes,
  problemeDureeQuestionS,
  problemesQcm,
  problemesQuestion,
  type ModeChrono,
  type OrigineQcm,
  type StatutQcm,
} from "@/lib/regles-qcm";
import { pluriel } from "@/lib/textes";
import { lireIdentifiant, valider } from "@/lib/validation";
import { journaliser, journaliserLesRefus } from "@/modules/journal";
import {
  chargerQuestions,
  exigerBrouillon,
  insererQuestion,
  MESSAGE_QCM_ARCHIVE,
  MODELE_QUESTION,
  qcmDeLActeur,
  schemaTitreQcm,
  versRegle,
  type QcmLu,
  type QuestionChargee,
} from "./commun";

export type QcmResume = {
  id: string;
  titre: string;
  statut: StatutQcm;
  origine: OrigineQcm;
  nombreQuestions: number;
  modifieLe: Date;
};

export type QuestionEditee = QuestionChargee & { problemes: string[] };

export type QcmEdite = {
  id: string;
  titre: string;
  statut: StatutQcm;
  origine: OrigineQcm;
  modeChrono: ModeChrono;
  dureeGlobaleS: number | null;
  dureeQuestionS: number | null;
  noteVisibleDefaut: boolean;
  correctionVisibleDefaut: boolean;
  modifieLe: Date;
  questions: QuestionEditee[];
  problemes: string[];
};

export type SaisieParametres = {
  qcmId: string;
  titre: string;
  modeChrono: string;
  dureeGlobaleMinutes: number | null;
  dureeQuestionS: number | null;
  noteVisibleDefaut: boolean;
  correctionVisibleDefaut: boolean;
};

export const MESSAGE_LIMITE_QCM = `Tu as atteint la limite de ${LIMITES_QCM.qcmParCompte} QCM.`;

const schemaCreation = z.strictObject({ titre: schemaTitreQcm });
const schemaQcm = z.strictObject({ qcmId: z.string() });
const schemaParametres = z.strictObject({
  qcmId: z.string(),
  titre: schemaTitreQcm,
  modeChrono: z.enum(MODES_CHRONO, { error: "Mode de chrono inconnu." }),
  dureeGlobaleMinutes: z
    .number({ error: MESSAGE_DUREE_GLOBALE })
    .nullable()
    .refine((v) => v === null || problemeDureeGlobaleMinutes(v) === null, { error: MESSAGE_DUREE_GLOBALE }),
  dureeQuestionS: z
    .number({ error: MESSAGE_DUREE_QUESTION })
    .nullable()
    .refine((v) => v === null || problemeDureeQuestionS(v) === null, { error: MESSAGE_DUREE_QUESTION }),
  noteVisibleDefaut: z.boolean({ error: "Réglage invalide." }),
  correctionVisibleDefaut: z.boolean({ error: "Réglage invalide." }),
});

function problemesDuQcm(lu: QcmLu, questions: QuestionChargee[]): string[] {
  return problemesQcm({
    modeChrono: lu.modeChrono,
    dureeGlobaleS: lu.dureeGlobaleS,
    dureeQuestionS: lu.dureeQuestionS,
    questions: questions.map(versRegle),
  });
}

async function journaliserStatut(
  tx: Transaction,
  acteur: ActeurUtilisateur,
  action: string,
  qcmId: string,
): Promise<void> {
  await journaliser({ acteur: { type: "utilisateur", id: acteur.id }, action, cible: `qcm:${qcmId}` }, tx);
}

/** Tous les QCM de l'acteur, archivés compris, du plus récemment modifié au plus ancien. */
export async function listerQcm(acteur: ActeurUtilisateur): Promise<QcmResume[]> {
  return journaliserLesRefus(acteur, "qcm.lister", async () =>
    db()
      .select({
        id: qcm.id,
        titre: qcm.titre,
        statut: qcm.statut,
        origine: qcm.origine,
        nombreQuestions: count(question.id),
        modifieLe: qcm.modifieLe,
      })
      .from(qcm)
      .leftJoin(question, eq(question.qcmId, qcm.id))
      .where(eq(qcm.enseignantId, acteur.id))
      .groupBy(qcm.id)
      .orderBy(desc(qcm.modifieLe)),
  );
}

/** Crée un QCM en brouillon avec sa question 1 (décision D9). */
export async function creerQcm(
  acteur: ActeurUtilisateur,
  saisie: { titre: string },
): Promise<{ id: string; questionId: string }> {
  return journaliserLesRefus(acteur, "qcm.creer", async () => {
    const { titre } = valider(schemaCreation, saisie, "QCM");
    return db().transaction(async (tx) => {
      // Sérialise les créations d'un même compte : la limite de 500 reste juste en concurrence.
      await tx
        .select({ id: utilisateur.id })
        .from(utilisateur)
        .where(eq(utilisateur.id, acteur.id))
        .for("update");
      const [compte] = await tx.select({ total: count() }).from(qcm).where(eq(qcm.enseignantId, acteur.id));
      if ((compte?.total ?? 0) >= LIMITES_QCM.qcmParCompte) throw erreurs.etat(MESSAGE_LIMITE_QCM);
      const le = maintenant();
      const [cree] = await tx
        .insert(qcm)
        .values({ enseignantId: acteur.id, titre, creeLe: le, modifieLe: le })
        .returning({ id: qcm.id });
      if (!cree) throw new Error("QCM non créé.");
      const questionId = await insererQuestion(tx, cree.id, 1, MODELE_QUESTION);
      await journaliserStatut(tx, acteur, "qcm.creer", cree.id);
      return { id: cree.id, questionId };
    });
  });
}

/** Un QCM de l'acteur, ses questions complètes et ce qui manque pour passer en « prêt » (éditeur). */
export async function lireQcm(acteur: ActeurUtilisateur, saisie: { qcmId: string }): Promise<QcmEdite> {
  return journaliserLesRefus(acteur, "qcm.lire", async () => {
    const qcmId = lireIdentifiant(valider(schemaQcm, saisie, "QCM").qcmId, "QCM");
    const lu = await qcmDeLActeur(db(), acteur, qcmId);
    const questions = await chargerQuestions(db(), qcmId);
    return {
      id: lu.id,
      titre: lu.titre,
      statut: lu.statut,
      origine: lu.origine,
      modeChrono: lu.modeChrono,
      dureeGlobaleS: lu.dureeGlobaleS,
      dureeQuestionS: lu.dureeQuestionS,
      noteVisibleDefaut: lu.noteVisibleDefaut,
      correctionVisibleDefaut: lu.correctionVisibleDefaut,
      modifieLe: lu.modifieLe,
      questions: questions.map((q) => ({ ...q, problemes: problemesQuestion(versRegle(q)) })),
      problemes: problemesDuQcm(lu, questions),
    };
  });
}

/** Titre, chrono (durée de l'examen en minutes, par question en secondes) et visibilité par défaut (D12). */
export async function modifierParametres(acteur: ActeurUtilisateur, saisie: SaisieParametres): Promise<void> {
  return journaliserLesRefus(acteur, "qcm.modifier_parametres", async () => {
    const donnees = valider(schemaParametres, saisie, "Paramètres");
    const qcmId = lireIdentifiant(donnees.qcmId, "QCM");
    await db().transaction(async (tx) => {
      exigerBrouillon(await qcmDeLActeur(tx, acteur, qcmId, true));
      await tx
        .update(qcm)
        .set({
          titre: donnees.titre,
          modeChrono: donnees.modeChrono,
          dureeGlobaleS: donnees.dureeGlobaleMinutes === null ? null : donnees.dureeGlobaleMinutes * 60,
          dureeQuestionS: donnees.dureeQuestionS,
          noteVisibleDefaut: donnees.noteVisibleDefaut,
          correctionVisibleDefaut: donnees.correctionVisibleDefaut,
          modifieLe: maintenant(),
        })
        .where(eq(qcm.id, qcmId));
    });
  });
}

/** Passe un brouillon en « prêt » s'il ne lui manque rien ; sinon VALIDATION avec `details.problemes` (D5). */
export async function marquerPret(acteur: ActeurUtilisateur, saisie: { qcmId: string }): Promise<void> {
  return journaliserLesRefus(acteur, "qcm.marquer_pret", async () => {
    const qcmId = lireIdentifiant(valider(schemaQcm, saisie, "QCM").qcmId, "QCM");
    await db().transaction(async (tx) => {
      const lu = await qcmDeLActeur(tx, acteur, qcmId, true);
      if (lu.statut === "pret") throw erreurs.etat("Ce QCM est déjà prêt.");
      if (lu.statut === "archive") throw erreurs.etat(MESSAGE_QCM_ARCHIVE);
      const problemes = problemesDuQcm(lu, await chargerQuestions(tx, qcmId));
      if (problemes.length > 0) {
        throw erreurs.validation(
          `Ce QCM ne peut pas encore passer en « prêt » : ${pluriel(problemes.length, "point à corriger", "points à corriger")}.`,
          { problemes },
        );
      }
      await tx.update(qcm).set({ statut: "pret", modifieLe: maintenant() }).where(eq(qcm.id, qcmId));
      await journaliserStatut(tx, acteur, "qcm.marquer_pret", qcmId);
    });
  });
}

/**
 * Change le statut d'un QCM si `refus(statut)` ne renvoie pas de message (D5), met à jour sa date de
 * modification et journalise l'action.
 */
async function changerStatut(
  acteur: ActeurUtilisateur,
  saisie: { qcmId: string },
  action: "qcm.repasser_brouillon" | "qcm.archiver" | "qcm.restaurer",
  refus: (statut: StatutQcm) => string | null,
  nouveau: StatutQcm,
): Promise<void> {
  return journaliserLesRefus(acteur, action, async () => {
    const qcmId = lireIdentifiant(valider(schemaQcm, saisie, "QCM").qcmId, "QCM");
    await db().transaction(async (tx) => {
      const lu = await qcmDeLActeur(tx, acteur, qcmId, true);
      const message = refus(lu.statut);
      if (message) throw erreurs.etat(message);
      await tx.update(qcm).set({ statut: nouveau, modifieLe: maintenant() }).where(eq(qcm.id, qcmId));
      await journaliserStatut(tx, acteur, action, qcmId);
    });
  });
}

/** Rend modifiable un QCM prêt. */
export async function repasserEnBrouillon(
  acteur: ActeurUtilisateur,
  saisie: { qcmId: string },
): Promise<void> {
  return changerStatut(
    acteur,
    saisie,
    "qcm.repasser_brouillon",
    (statut) =>
      statut === "brouillon"
        ? "Ce QCM est déjà en brouillon."
        : statut === "archive"
          ? MESSAGE_QCM_ARCHIVE
          : null,
    "brouillon",
  );
}

/** Range le QCM dans « QCM archivés », en lecture seule (aucune suppression, spec §4.3). */
export async function archiverQcm(acteur: ActeurUtilisateur, saisie: { qcmId: string }): Promise<void> {
  return changerStatut(
    acteur,
    saisie,
    "qcm.archiver",
    (statut) => (statut === "archive" ? "Ce QCM est déjà archivé." : null),
    "archive",
  );
}

/** Remet un QCM archivé en brouillon. */
export async function restaurerQcm(acteur: ActeurUtilisateur, saisie: { qcmId: string }): Promise<void> {
  return changerStatut(
    acteur,
    saisie,
    "qcm.restaurer",
    (statut) => (statut === "archive" ? null : "Ce QCM n'est pas archivé."),
    "brouillon",
  );
}
