/**
 * Questions d'un QCM (spec §4.2 ; décisions D3, D4, D6 à D10 et D16 du plan du lot 3) : ajout,
 * enregistrement (question entière, réponses remplacées en bloc), suppression, déplacement par blocs
 * et liaisons. Chaque écriture verrouille le QCM et exige un brouillon. Non journalisées (D15), sauf
 * les refus d'accès.
 */
import "server-only";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { proposition, question } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { erreurs } from "@/lib/erreurs";
import { MESSAGE_POINTS_NOMBRE, problemePoints, type SortePoints } from "@/lib/points";
import {
  CLES_LANGAGES,
  decouperEnBlocs,
  LIMITES_QCM,
  MESSAGE_DUREE_QUESTION,
  problemeDureeQuestionS,
  TYPES_QUESTION,
  type LangageCode,
  type TypeQuestion,
} from "@/lib/regles-qcm";
import { lireIdentifiant, valider } from "@/lib/validation";
import { verifierImagesDeLActeur } from "@/modules/images";
import { journaliserLesRefus } from "@/modules/journal";
import {
  exigerBrouillon,
  insererQuestion,
  MODELE_QUESTION,
  qcmDeLActeur,
  questionDeLActeur,
  questionsOrdonnees,
  reecrirePositions,
  schemaTexte,
  toucherQcm,
} from "./commun";

export const MESSAGE_QCM_PLEIN = `Ce QCM compte déjà ${LIMITES_QCM.questionsMax} questions, le maximum.`;

export type SaisieQuestion = {
  questionId: string;
  type: TypeQuestion;
  enonce: string;
  imageId: string | null;
  code: { langage: LangageCode; source: string } | null;
  propositions: { texte: string; imageId: string | null; correcte: boolean }[];
  pointsBonne: number;
  pointsMauvaise: number;
  pointsVide: number;
  dureeS: number | null;
};

function schemaPoints(sorte: SortePoints) {
  return z.number({ error: MESSAGE_POINTS_NOMBRE }).superRefine((valeur, contexte) => {
    const probleme = problemePoints(valeur, sorte);
    if (probleme) contexte.addIssue({ code: "custom", message: probleme });
  });
}

const schemaEnregistrement = z.strictObject({
  questionId: z.string(),
  type: z.enum(TYPES_QUESTION, { error: "Type de question inconnu." }),
  enonce: schemaTexte("L'énoncé", LIMITES_QCM.enonceMax, "\n\t"),
  imageId: z.string().nullable(),
  code: z
    .strictObject({
      langage: z.enum(CLES_LANGAGES, { error: "Langage non pris en charge." }),
      source: schemaTexte("Le code", LIMITES_QCM.codeMax, "\n\t"),
    })
    .nullable(),
  propositions: z
    .array(
      z.strictObject({
        texte: schemaTexte("La réponse", LIMITES_QCM.reponseMax, ""),
        imageId: z.string().nullable(),
        correcte: z.boolean({ error: "La bonne réponse est invalide." }),
      }),
      { error: "Les réponses sont invalides." },
    )
    .max(LIMITES_QCM.reponsesMax, { error: `Une question a ${LIMITES_QCM.reponsesMax} réponses au plus.` }),
  pointsBonne: schemaPoints("bonne"),
  pointsMauvaise: schemaPoints("mauvaise"),
  pointsVide: schemaPoints("vide"),
  dureeS: z
    .number({ error: MESSAGE_DUREE_QUESTION })
    .nullable()
    .refine((v) => v === null || problemeDureeQuestionS(v) === null, { error: MESSAGE_DUREE_QUESTION }),
});
const schemaQcm = z.strictObject({ qcmId: z.string() });
const schemaQuestion = z.strictObject({ questionId: z.string() });
const schemaDeplacement = z.strictObject({
  questionId: z.string(),
  sens: z.enum(["haut", "bas"], { error: "Sens de déplacement inconnu." }),
});
const schemaLiaison = z.strictObject({
  questionId: z.string(),
  lieeASuivante: z.boolean({ error: "Liaison invalide." }),
});

/** Ajoute une question à la fin, sur le modèle de la dernière (décision D9). */
export async function ajouterQuestion(
  acteur: ActeurUtilisateur,
  saisie: { qcmId: string },
): Promise<{ id: string }> {
  return journaliserLesRefus(acteur, "questions.ajouter", async () => {
    const qcmId = lireIdentifiant(valider(schemaQcm, saisie, "Question").qcmId, "QCM");
    return db().transaction(async (tx) => {
      exigerBrouillon(await qcmDeLActeur(tx, acteur, qcmId, true));
      const [compte] = await tx.select({ total: count() }).from(question).where(eq(question.qcmId, qcmId));
      const total = compte?.total ?? 0;
      if (total >= LIMITES_QCM.questionsMax) throw erreurs.etat(MESSAGE_QCM_PLEIN);
      const [derniere] = await tx
        .select({
          type: question.type,
          pointsBonne: question.pointsBonne,
          pointsMauvaise: question.pointsMauvaise,
          pointsVide: question.pointsVide,
        })
        .from(question)
        .where(eq(question.qcmId, qcmId))
        .orderBy(desc(question.position))
        .limit(1);
      const id = await insererQuestion(tx, qcmId, total + 1, derniere ?? MODELE_QUESTION);
      await toucherQcm(tx, qcmId);
      return { id };
    });
  });
}

/**
 * Enregistre la question entière envoyée par l'éditeur (décision D8) : ses réponses sont remplacées en
 * bloc. Une question incomplète est acceptée (brouillon) ; les images citées doivent être à l'acteur.
 */
export async function enregistrerQuestion(
  acteur: ActeurUtilisateur,
  saisie: SaisieQuestion,
): Promise<{ modifieLe: Date }> {
  return journaliserLesRefus(acteur, "questions.enregistrer", async () => {
    const donnees = valider(schemaEnregistrement, saisie, "Question");
    const questionId = lireIdentifiant(donnees.questionId, "Question");
    return db().transaction(async (tx) => {
      const { qcm: lu } = await questionDeLActeur(tx, acteur, questionId);
      exigerBrouillon(lu);
      const images = [donnees.imageId, ...donnees.propositions.map((p) => p.imageId)].filter(
        (id): id is string => id !== null,
      );
      await verifierImagesDeLActeur(tx, acteur, images);
      await tx
        .update(question)
        .set({
          type: donnees.type,
          enonce: donnees.enonce,
          imageId: donnees.imageId,
          codeLangage: donnees.code?.langage ?? null,
          codeSource: donnees.code?.source ?? null,
          pointsBonne: donnees.pointsBonne,
          pointsMauvaise: donnees.pointsMauvaise,
          pointsVide: donnees.pointsVide,
          dureeS: donnees.dureeS,
        })
        .where(eq(question.id, questionId));
      await tx.delete(proposition).where(eq(proposition.questionId, questionId));
      if (donnees.propositions.length > 0) {
        await tx.insert(proposition).values(
          donnees.propositions.map((p, index) => ({
            questionId,
            position: index + 1,
            texte: p.texte,
            imageId: p.imageId,
            correcte: p.correcte,
          })),
        );
      }
      return { modifieLe: await toucherQcm(tx, lu.id) };
    });
  });
}

/** Supprime une question et renumérote les autres ; renvoie la question à afficher ensuite (D6). */
export async function supprimerQuestion(
  acteur: ActeurUtilisateur,
  saisie: { questionId: string },
): Promise<{ qcmId: string; voisineId: string | null }> {
  return journaliserLesRefus(acteur, "questions.supprimer", async () => {
    const questionId = lireIdentifiant(valider(schemaQuestion, saisie, "Question").questionId, "Question");
    return db().transaction(async (tx) => {
      const { qcm: lu, question: supprimee } = await questionDeLActeur(tx, acteur, questionId);
      exigerBrouillon(lu);
      const liste = await questionsOrdonnees(tx, lu.id);
      const index = liste.findIndex((q) => q.id === questionId);
      const precedente = index > 0 ? liste[index - 1] : undefined;
      // La précédente ne reste liée que si la question supprimée l'était à la suivante (décision D6).
      if (precedente?.lieeASuivante && !supprimee.lieeASuivante) {
        await tx.update(question).set({ lieeASuivante: false }).where(eq(question.id, precedente.id));
      }
      await tx.delete(question).where(eq(question.id, questionId));
      const restantes = liste.filter((q) => q.id !== questionId).map((q) => q.id);
      await reecrirePositions(tx, lu.id, restantes);
      await toucherQcm(tx, lu.id);
      return { qcmId: lu.id, voisineId: restantes[Math.min(index, restantes.length - 1)] ?? null };
    });
  });
}

/** Déplace le bloc entier de la question par-dessus le bloc voisin (décisions D6 et D7). */
export async function deplacerQuestion(
  acteur: ActeurUtilisateur,
  saisie: { questionId: string; sens: "haut" | "bas" },
): Promise<void> {
  return journaliserLesRefus(acteur, "questions.deplacer", async () => {
    const donnees = valider(schemaDeplacement, saisie, "Question");
    const questionId = lireIdentifiant(donnees.questionId, "Question");
    await db().transaction(async (tx) => {
      const { qcm: lu } = await questionDeLActeur(tx, acteur, questionId);
      exigerBrouillon(lu);
      const blocs = decouperEnBlocs(await questionsOrdonnees(tx, lu.id));
      const i = blocs.findIndex((bloc) => bloc.some((q) => q.id === questionId));
      const j = donnees.sens === "haut" ? i - 1 : i + 1;
      if (j < 0) throw erreurs.etat("Cette question est déjà en tête du QCM.");
      if (j >= blocs.length) throw erreurs.etat("Cette question est déjà à la fin du QCM.");
      const bloc = blocs[i];
      const voisin = blocs[j];
      if (!bloc || !voisin) throw new Error("Bloc de questions introuvable.");
      blocs[i] = voisin;
      blocs[j] = bloc;
      await reecrirePositions(
        tx,
        lu.id,
        blocs.flat().map((q) => q.id),
      );
      await toucherQcm(tx, lu.id);
    });
  });
}

/**
 * Pose ou retire la liaison de la question avec la suivante (spec §4.2) : « lier à la question du
 * dessus » s'applique à la précédente. La dernière question n'est jamais liée (décision D6).
 */
export async function lierQuestion(
  acteur: ActeurUtilisateur,
  saisie: { questionId: string; lieeASuivante: boolean },
): Promise<void> {
  return journaliserLesRefus(acteur, "questions.lier", async () => {
    const donnees = valider(schemaLiaison, saisie, "Question");
    const questionId = lireIdentifiant(donnees.questionId, "Question");
    await db().transaction(async (tx) => {
      const { qcm: lu, question: courante } = await questionDeLActeur(tx, acteur, questionId);
      exigerBrouillon(lu);
      if (courante.lieeASuivante === donnees.lieeASuivante) return;
      if (donnees.lieeASuivante) {
        const [suivante] = await tx
          .select({ id: question.id })
          .from(question)
          .where(and(eq(question.qcmId, lu.id), eq(question.position, courante.position + 1)));
        if (!suivante) throw erreurs.etat("La dernière question ne peut pas être liée à la suivante.");
      }
      await tx
        .update(question)
        .set({ lieeASuivante: donnees.lieeASuivante })
        .where(eq(question.id, questionId));
      await toucherQcm(tx, lu.id);
    });
  });
}
