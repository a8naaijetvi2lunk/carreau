/**
 * Contrôles partagés du module qcm (spec §4.2 ; décisions D1, D3, D5, D7, D9 et D16 du plan du lot 3) :
 * propriété et statut d'un QCM, textes saisis, positions des questions, chargement complet.
 */
import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executeur, Transaction } from "@/db";
import { image, proposition, qcm, question } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { erreurs } from "@/lib/erreurs";
import { maintenant } from "@/lib/horloge";
import type { ImageVue } from "@/lib/images";
import {
  estLangageCode,
  LIMITES_QCM,
  type LangageCode,
  type ModeChrono,
  type OrigineQcm,
  type QuestionRegle,
  type StatutQcm,
  type TypeQuestion,
} from "@/lib/regles-qcm";

export const MESSAGE_QCM_PRET = "Ce QCM est prêt : repasse-le en brouillon pour le modifier.";
export const MESSAGE_QCM_ARCHIVE = "Ce QCM est archivé : restaure-le pour le modifier.";

const CARACTERE_DE_CONTROLE = /\p{Cc}/u;

/** Vrai si `texte` ne contient aucun caractère de contrôle, hors ceux de `autorises` (ex. retour à la ligne). */
function sansControle(texte: string, autorises: string): boolean {
  for (const caractere of texte) {
    if (CARACTERE_DE_CONTROLE.test(caractere) && !autorises.includes(caractere)) return false;
  }
  return true;
}

/**
 * Texte libre (énoncé, code, réponse) : retours à la ligne unifiés, longueur bornée, caractères de
 * contrôle refusés hors `autorises`. Jamais rogné : l'éditeur renvoie ce qui est saisi (décision D8).
 */
export function schemaTexte(libelle: string, max: number, autorises: string) {
  return z
    .string({ error: `${libelle} est invalide.` })
    .transform((valeur) => valeur.replace(/\r\n?/g, "\n"))
    .pipe(
      z
        .string()
        .max(max, { error: `${libelle} dépasse ${max} caractères.` })
        .refine((valeur) => sansControle(valeur, autorises), {
          error: `${libelle} contient des caractères non autorisés.`,
        }),
    );
}

/** Titre d'un QCM : espaces rognés et réduits, 1 à 120 caractères, sans caractère de contrôle (décision D3). */
export const schemaTitreQcm = z
  .string({ error: "Le titre est obligatoire." })
  .transform((valeur) => valeur.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(1, { error: "Le titre est obligatoire." })
      .max(LIMITES_QCM.titreMax, { error: `Le titre dépasse ${LIMITES_QCM.titreMax} caractères.` })
      .regex(/^[^\p{Cc}]*$/u, { error: "Le titre contient des caractères non autorisés." }),
  );

export type QcmLu = {
  id: string;
  enseignantId: string;
  titre: string;
  statut: StatutQcm;
  origine: OrigineQcm;
  modeChrono: ModeChrono;
  dureeGlobaleS: number | null;
  dureeQuestionS: number | null;
  noteVisibleDefaut: boolean;
  correctionVisibleDefaut: boolean;
  modifieLe: Date;
};

/**
 * QCM de l'acteur. `verrouiller` le lit `FOR UPDATE` : toute écriture sur un QCM ou ses questions le
 * verrouille d'abord (décision D16). QCM d'un autre compte : même réponse qu'un QCM inexistant, refus
 * journalisé par `journaliserLesRefus` (décision D1).
 */
export async function qcmDeLActeur(
  executeur: Executeur,
  acteur: ActeurUtilisateur,
  qcmId: string,
  verrouiller = false,
): Promise<QcmLu> {
  const requete = executeur
    .select({
      id: qcm.id,
      enseignantId: qcm.enseignantId,
      titre: qcm.titre,
      statut: qcm.statut,
      origine: qcm.origine,
      modeChrono: qcm.modeChrono,
      dureeGlobaleS: qcm.dureeGlobaleS,
      dureeQuestionS: qcm.dureeQuestionS,
      noteVisibleDefaut: qcm.noteVisibleDefaut,
      correctionVisibleDefaut: qcm.correctionVisibleDefaut,
      modifieLe: qcm.modifieLe,
    })
    .from(qcm)
    .where(eq(qcm.id, qcmId));
  const [ligne] = verrouiller ? await requete.for("update") : await requete;
  if (!ligne) throw erreurs.introuvable("QCM");
  if (ligne.enseignantId !== acteur.id) throw erreurs.ressourceAutrui("QCM");
  return ligne;
}

/** Seul un brouillon se modifie (décision D5). */
export function exigerBrouillon(lu: QcmLu): void {
  if (lu.statut === "pret") throw erreurs.etat(MESSAGE_QCM_PRET);
  if (lu.statut === "archive") throw erreurs.etat(MESSAGE_QCM_ARCHIVE);
}

export type QuestionLigne = typeof question.$inferSelect;

/**
 * Question d'un QCM de l'acteur : son QCM verrouillé, puis elle-même relue (décision D16).
 * Question d'un autre compte : « Question introuvable. », refus journalisé.
 */
export async function questionDeLActeur(
  tx: Transaction,
  acteur: ActeurUtilisateur,
  questionId: string,
): Promise<{ qcm: QcmLu; question: QuestionLigne }> {
  const [proprietaire] = await tx
    .select({ qcmId: question.qcmId, enseignantId: qcm.enseignantId })
    .from(question)
    .innerJoin(qcm, eq(qcm.id, question.qcmId))
    .where(eq(question.id, questionId));
  if (!proprietaire) throw erreurs.introuvable("Question");
  if (proprietaire.enseignantId !== acteur.id) throw erreurs.ressourceAutrui("Question");
  const lu = await qcmDeLActeur(tx, acteur, proprietaire.qcmId, true);
  const [ligne] = await tx.select().from(question).where(eq(question.id, questionId));
  // Supprimée par un autre onglet entre la première lecture et le verrou.
  if (!ligne) throw erreurs.introuvable("Question");
  return { qcm: lu, question: ligne };
}

/** Met à jour la date de modification du QCM et la renvoie (« Enregistré à 10:12 »). */
export async function toucherQcm(tx: Transaction, qcmId: string): Promise<Date> {
  const le = maintenant();
  await tx.update(qcm).set({ modifieLe: le }).where(eq(qcm.id, qcmId));
  return le;
}

/** Questions d'un QCM dans l'ordre : identifiant, position et liaison. */
export async function questionsOrdonnees(tx: Transaction, qcmId: string) {
  return tx
    .select({ id: question.id, position: question.position, lieeASuivante: question.lieeASuivante })
    .from(question)
    .where(eq(question.qcmId, qcmId))
    .orderBy(asc(question.position));
}

/**
 * Renumérote les questions 1..n dans l'ordre de `ids`, qui doit contenir toutes les questions du QCM
 * (décision D7) : d'abord en négatif, puis aux positions finales. PostgreSQL vérifie l'index unique
 * ligne par ligne : une permutation écrite en une seule fois buterait sur une position encore occupée.
 */
export async function reecrirePositions(
  tx: Transaction,
  qcmId: string,
  ids: readonly string[],
): Promise<void> {
  await tx
    .update(question)
    .set({ position: sql`-${question.position}` })
    .where(eq(question.qcmId, qcmId));
  for (const [index, id] of ids.entries()) {
    await tx
      .update(question)
      .set({ position: index + 1 })
      .where(eq(question.id, id));
  }
}

export type ModeleQuestion = {
  type: TypeQuestion;
  pointsBonne: number;
  pointsMauvaise: number;
  pointsVide: number;
};

export const MODELE_QUESTION: ModeleQuestion = {
  type: "unique",
  pointsBonne: 1,
  pointsMauvaise: 0,
  pointsVide: 0,
};

/** Nouvelle question à `position`, sur le modèle donné, avec deux réponses (décision D9). */
export async function insererQuestion(
  tx: Transaction,
  qcmId: string,
  position: number,
  modele: ModeleQuestion,
): Promise<string> {
  const [creee] = await tx
    .insert(question)
    .values({ qcmId, position, ...modele })
    .returning({ id: question.id });
  if (!creee) throw new Error("Question non créée.");
  const textes = modele.type === "vrai_faux" ? ["Vrai", "Faux"] : ["", ""];
  await tx
    .insert(proposition)
    .values(textes.map((texte, index) => ({ questionId: creee.id, position: index + 1, texte })));
  return creee.id;
}

export type PropositionChargee = { texte: string; image: ImageVue | null; correcte: boolean };

export type QuestionChargee = {
  id: string;
  position: number;
  type: TypeQuestion;
  enonce: string;
  image: ImageVue | null;
  code: { langage: LangageCode; source: string } | null;
  propositions: PropositionChargee[];
  pointsBonne: number;
  pointsMauvaise: number;
  pointsVide: number;
  dureeS: number | null;
  lieeASuivante: boolean;
};

function imageDe(ligne: {
  imageId: string | null;
  imageLargeur: number | null;
  imageHauteur: number | null;
}): ImageVue | null {
  return ligne.imageId !== null && ligne.imageLargeur !== null && ligne.imageHauteur !== null
    ? { id: ligne.imageId, largeur: ligne.imageLargeur, hauteur: ligne.imageHauteur }
    : null;
}

/** Questions d'un QCM, dans l'ordre, avec leurs réponses et les dimensions de leurs images (deux requêtes). */
export async function chargerQuestions(executeur: Executeur, qcmId: string): Promise<QuestionChargee[]> {
  const lignes = await executeur
    .select({
      id: question.id,
      position: question.position,
      type: question.type,
      enonce: question.enonce,
      codeLangage: question.codeLangage,
      codeSource: question.codeSource,
      pointsBonne: question.pointsBonne,
      pointsMauvaise: question.pointsMauvaise,
      pointsVide: question.pointsVide,
      dureeS: question.dureeS,
      lieeASuivante: question.lieeASuivante,
      imageId: image.id,
      imageLargeur: image.largeur,
      imageHauteur: image.hauteur,
    })
    .from(question)
    .leftJoin(image, eq(image.id, question.imageId))
    .where(eq(question.qcmId, qcmId))
    .orderBy(asc(question.position));
  const reponses = await executeur
    .select({
      questionId: proposition.questionId,
      texte: proposition.texte,
      correcte: proposition.correcte,
      imageId: image.id,
      imageLargeur: image.largeur,
      imageHauteur: image.hauteur,
    })
    .from(proposition)
    .innerJoin(question, eq(question.id, proposition.questionId))
    .leftJoin(image, eq(image.id, proposition.imageId))
    .where(eq(question.qcmId, qcmId))
    .orderBy(asc(proposition.questionId), asc(proposition.position));
  const parQuestion = new Map<string, PropositionChargee[]>();
  for (const r of reponses) {
    const liste = parQuestion.get(r.questionId) ?? [];
    liste.push({ texte: r.texte, image: imageDe(r), correcte: r.correcte });
    parQuestion.set(r.questionId, liste);
  }
  return lignes.map((l) => ({
    id: l.id,
    position: l.position,
    type: l.type,
    enonce: l.enonce,
    image: imageDe(l),
    code:
      l.codeLangage !== null && l.codeSource !== null && estLangageCode(l.codeLangage)
        ? { langage: l.codeLangage, source: l.codeSource }
        : null,
    propositions: parQuestion.get(l.id) ?? [],
    pointsBonne: l.pointsBonne,
    pointsMauvaise: l.pointsMauvaise,
    pointsVide: l.pointsVide,
    dureeS: l.dureeS,
    lieeASuivante: l.lieeASuivante,
  }));
}

/** Question chargée → forme attendue par les règles de complétude. */
export function versRegle(q: QuestionChargee): QuestionRegle {
  return {
    type: q.type,
    enonce: q.enonce,
    code: q.code,
    propositions: q.propositions.map((p) => ({
      texte: p.texte,
      imageId: p.image?.id ?? null,
      correcte: p.correcte,
    })),
  };
}
