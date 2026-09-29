/**
 * Notation (spec §6.6, décision D9 du plan du lot 5), sur l'instantané : choix multiples en tout ou
 * rien, total borné à 0, note sur 20 arrondie au centième. Calcul en centièmes entiers : les points
 * du barème ont au plus deux décimales (lot 3).
 */
import type { TypeQuestion } from "@/lib/regles-qcm";

export type QuestionNotee = {
  type: TypeQuestion;
  propositions: readonly { correcte: boolean }[];
  pointsBonne: number;
  pointsMauvaise: number;
  pointsVide: number;
};

function centiemes(valeur: number): number {
  return Math.round(valeur * 100);
}

/**
 * Points d'une question ; `selection` : index d'origine des réponses cochées. Aucune case → points
 * « sans réponse » ; exactement les bonnes → points « bonne » ; sinon → points « mauvaise ». Pour un
 * choix unique ou un vrai/faux, l'ensemble des bonnes réponses n'a qu'un élément.
 */
export function pointsQuestion(question: QuestionNotee, selection: readonly number[]): number {
  const choisies = new Set(selection);
  if (choisies.size === 0) return question.pointsVide;
  const correctes = new Set(question.propositions.flatMap((p, index) => (p.correcte ? [index] : [])));
  const exacte = choisies.size === correctes.size && [...choisies].every((index) => correctes.has(index));
  return exacte ? question.pointsBonne : question.pointsMauvaise;
}

/** Total borné à 0 et note sur 20 ; `bareme` : somme des points des bonnes réponses de l'examen. */
export function noter(points: readonly number[], bareme: number): { total: number; note: number } {
  const baremeC = centiemes(bareme);
  if (baremeC <= 0) throw new Error("Barème nul : aucune note possible.");
  const totalC = Math.max(
    0,
    points.reduce((somme, p) => somme + centiemes(p), 0),
  );
  return { total: totalC / 100, note: Math.round((totalC * 2000) / baremeC) / 100 };
}
