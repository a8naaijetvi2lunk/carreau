/**
 * Correction montrée à l'étudiant (spec §9.1, décisions D11 et D13 du plan du lot 7), sur son
 * téléphone, une fois l'examen et ses rattrapages terminés : ses questions dans son ordre, ses
 * réponses et les bonnes réponses.
 */
import type { TypeQuestion } from "./regles-qcm";
import type { ImageAffichee, JetonCode } from "./vue-question";

export type PropositionCorrigee = {
  texte: string;
  image: ImageAffichee | null;
  correcte: boolean;
  /** Cochée par l'étudiant. */
  choisie: boolean;
};

export type QuestionCorrigee = {
  /** Rang dans l'ordre de l'étudiant (« Question 1 » = sa première question, D7). */
  rang: number;
  type: TypeQuestion;
  enonce: string;
  image: ImageAffichee | null;
  code: { libelle: string; lignes: JetonCode[][] } | null;
  propositions: PropositionCorrigee[];
  resultat: "juste" | "faux" | "vide";
  points: number;
  pointsBonne: number;
};

export type VueCorrection = {
  /** Note sur 20 si l'enseignant la rend visible, null sinon. */
  note: number | null;
  questions: QuestionCorrigee[];
};
