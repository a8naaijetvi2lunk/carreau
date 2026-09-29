/**
 * Mélange d'un examen pour un étudiant (spec §6.7, décision D4 du plan du lot 5) : blocs de questions
 * liées mélangés par Fisher-Yates, ordre interne d'un bloc conservé, réponses de chaque question
 * mélangées indépendamment. Le tirage est injecté : `randomInt` de node:crypto en production, suite
 * fixée en test. L'ordre calculé est stocké, ce qui rend correction et rapport reproductibles.
 */
import type { OrdrePassage } from "@/lib/instantane";
import { decouperEnBlocs } from "@/lib/regles-qcm";

/** Entier uniforme de [0, n). */
export type Tirage = (n: number) => number;

function tirerDans(tirer: Tirage, n: number): number {
  const valeur = tirer(n);
  if (!Number.isInteger(valeur) || valeur < 0 || valeur >= n) {
    throw new Error(`Tirage hors bornes : ${String(valeur)} pour ${n}.`);
  }
  return valeur;
}

/** Mélange de Fisher-Yates : une nouvelle liste, l'originale reste intacte. */
export function melanger<T>(elements: readonly T[], tirer: Tirage): T[] {
  const copie = [...elements];
  for (let i = copie.length - 1; i > 0; i -= 1) {
    const j = tirerDans(tirer, i + 1);
    const a = copie[i] as T;
    copie[i] = copie[j] as T;
    copie[j] = a;
  }
  return copie;
}

/**
 * Ordre d'un étudiant : `q`, index de la question dans l'instantané ; `p`, index d'origine de ses
 * réponses dans l'ordre affiché.
 */
export function calculerOrdre(
  questions: readonly { lieeASuivante: boolean; propositions: readonly unknown[] }[],
  tirer: Tirage,
): OrdrePassage {
  const indexees = questions.map((q, index) => ({
    index,
    lieeASuivante: q.lieeASuivante,
    nombre: q.propositions.length,
  }));
  const blocs = melanger(decouperEnBlocs(indexees), tirer);
  return blocs.flat().map((q) => ({
    q: q.index,
    p: melanger(
      Array.from({ length: q.nombre }, (_, i) => i),
      tirer,
    ),
  }));
}
