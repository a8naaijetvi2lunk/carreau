/**
 * Vue du passage pour le téléphone (spec §6.4 ; décisions D4 et D11 du plan du lot 5) : après
 * rattrapage, la question courante seule (extraite de l'instantané, sans l'indicateur de bonne
 * réponse, identifiants = positions affichées), ou l'écran de fin. Null avant le départ ou hors examen.
 */
import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { reponse } from "@/db/schema";
import { maintenant } from "@/lib/horloge";
import { urlImage } from "@/lib/images";
import type { QuestionInstantanee } from "@/lib/instantane";
import type { ImageAffichee, VueQuestion } from "@/lib/vue-question";
import { lireQuestion } from "./commun";
import { sortieRecente } from "./indice";
import { passageAJour, type Passage } from "./passage";

export type VuePassage =
  | {
      etape: "question";
      question: VueQuestion;
      selection: string[];
      echeance: string | null;
      sortieNotee: { dureeS: number } | null;
    }
  | {
      etape: "fin";
      enregistreesLe: string;
      repondues: number;
      total: number;
      dureeS: number;
      note: number | null;
    };

function affichee(image: { id: string; largeur: number; hauteur: number } | null): ImageAffichee | null {
  return image ? { url: urlImage(image.id), largeur: image.largeur, hauteur: image.hauteur } : null;
}

/** Question telle que la voit l'étudiant : réponses dans son ordre, identifiées par leur position affichée. */
export function vueQuestion(
  question: QuestionInstantanee,
  p: readonly number[],
  rang: number,
  total: number,
): VueQuestion {
  return {
    rang,
    total,
    type: question.type,
    enonce: question.enonce,
    image: affichee(question.image),
    code: question.code,
    propositions: p.map((origine, position) => {
      const proposition = question.propositions[origine];
      if (!proposition) throw new Error(`Réponse absente de l'instantané : ${origine}.`);
      return { id: String(position), texte: proposition.texte, image: affichee(proposition.image) };
    }),
  };
}

async function vueFin(passage: Passage, instant: Date): Promise<VuePassage> {
  const validees = await db()
    .select({ selection: reponse.selection })
    .from(reponse)
    .where(and(eq(reponse.participationId, passage.id), isNotNull(reponse.valideeLe)));
  const termineeLe = passage.etat.termineeLe ?? instant;
  const demarreLe = passage.session.demarreLe ?? termineeLe;
  return {
    etape: "fin",
    enregistreesLe: termineeLe.toISOString(),
    repondues: validees.filter((v) => (v.selection?.length ?? 0) > 0).length,
    total: passage.ordre?.length ?? validees.length,
    dureeS: Math.max(0, Math.round((termineeLe.getTime() - demarreLe.getTime()) / 1000)),
    note: passage.session.noteVisible ? passage.noteSur20 : null,
  };
}

export async function vuePassage(participationId: string): Promise<VuePassage | null> {
  const instant = maintenant();
  const passage = await passageAJour(participationId, instant, true);
  if (!passage) return null;
  if (passage.statut === "terminee") return vueFin(passage, instant);
  const demarre =
    passage.session.demarreLe !== null && instant.getTime() >= passage.session.demarreLe.getTime();
  if (passage.statut !== "en_cours" || !passage.ordre || !demarre) return null;
  const index = passage.etat.indexCourant;
  const entree = passage.ordre[index];
  if (!entree) return null;
  const question = await lireQuestion(db(), passage.session.id, entree.q);
  const [brouillon] = await db()
    .select({ selection: reponse.selectionBrouillon })
    .from(reponse)
    .where(and(eq(reponse.participationId, passage.id), eq(reponse.questionCle, question.cle)));
  const echeance = passage.etat.echeanceQuestionLe ?? passage.etat.echeanceGlobaleLe;
  return {
    etape: "question",
    question: vueQuestion(question, entree.p, index + 1, passage.ordre.length),
    selection: (brouillon?.selection ?? [])
      .map((origine) => entree.p.indexOf(origine))
      .filter((position) => position >= 0)
      .sort((a, b) => a - b)
      .map(String),
    echeance: echeance ? echeance.toISOString() : null,
    sortieNotee: await sortieRecente(db(), passage.id, instant),
  };
}

/**
 * Vrai si l'image est citée par la question **courante** de la participation (énoncé ou réponse),
 * après rattrapage, une fois le départ passé (spec §11.1, décision D12). Jamais pour la question
 * suivante, jamais après la fin.
 */
export async function imageDeLaQuestionCourante(participationId: string, imageId: string): Promise<boolean> {
  const instant = maintenant();
  const passage = await passageAJour(participationId, instant);
  if (!passage || passage.statut !== "en_cours" || !passage.ordre) return false;
  const demarreLe = passage.session.demarreLe;
  if (demarreLe === null || instant.getTime() < demarreLe.getTime()) return false;
  const entree = passage.ordre[passage.etat.indexCourant];
  if (!entree) return false;
  const question = await lireQuestion(db(), passage.session.id, entree.q);
  return question.image?.id === imageId || question.propositions.some((p) => p.image?.id === imageId);
}
