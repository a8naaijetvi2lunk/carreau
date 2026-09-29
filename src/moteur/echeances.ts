/**
 * Échéances du passage (spec §6.5 ; décision D2 et amendement A3 du plan du lot 5). Fonctions pures :
 * l'instant est toujours passé en paramètre. Une échéance devient effective 3 s après sa valeur
 * (tolérance réseau) ; une question échue est close à cet instant d'expiration et la suivante est
 * servie au même instant, si bien qu'un téléphone éteint retrouve des échéances enchaînées.
 */
import { TOLERANCE_ECHEANCE_MS } from "@/lib/regles-examen";
import type { ModeChrono } from "@/lib/regles-qcm";
import { dureeAvecTiersTempsS } from "@/lib/regles-session";

export type ChronoPassage = {
  modeChrono: ModeChrono;
  dureeGlobaleS: number | null;
  /** Durée de chaque question dans l'ordre de l'étudiant (chrono par question) ; null dans les autres modes. */
  dureesS: readonly (number | null)[];
  /** Tiers-temps figé au départ (amendement A1). */
  tiersTemps: boolean;
};

/** Où en est un étudiant (colonnes de `participation`). */
export type EtatPassage = {
  /** Index (0 à total − 1) de la question courante ; `total` une fois l'examen terminé. */
  indexCourant: number;
  questionServieLe: Date | null;
  echeanceQuestionLe: Date | null;
  echeanceGlobaleLe: Date | null;
  termineeLe: Date | null;
};

/** Question close par le serveur : échue (sa dernière sélection est validée) ou jamais servie avant la fin. */
export type Cloture = { index: number; origine: "echeance" | "fin"; le: Date };

export type Rattrapage = { etat: EtatPassage; clotures: Cloture[] };

function dureeMs(secondes: number, tiersTemps: boolean): number {
  return (tiersTemps ? dureeAvecTiersTempsS(secondes) : secondes) * 1000;
}

function ajouter(instant: Date, ms: number): Date {
  return new Date(instant.getTime() + ms);
}

/** Échéance de la question `index` servie à `servieLe` : chrono par question seulement. */
export function echeanceQuestion(chrono: ChronoPassage, index: number, servieLe: Date): Date | null {
  if (chrono.modeChrono !== "par_question") return null;
  const duree = chrono.dureesS[index];
  if (duree === null || duree === undefined) throw new Error(`Durée absente pour la question ${index + 1}.`);
  return ajouter(servieLe, dureeMs(duree, chrono.tiersTemps));
}

/** État au départ commun : première question servie à `demarreLe`, échéances posées. */
export function etatDeDepart(chrono: ChronoPassage, demarreLe: Date): EtatPassage {
  let echeanceGlobaleLe: Date | null = null;
  if (chrono.modeChrono === "global") {
    if (chrono.dureeGlobaleS === null) throw new Error("Durée globale absente.");
    echeanceGlobaleLe = ajouter(demarreLe, dureeMs(chrono.dureeGlobaleS, chrono.tiersTemps));
  }
  return {
    indexCourant: 0,
    questionServieLe: demarreLe,
    echeanceQuestionLe: echeanceQuestion(chrono, 0, demarreLe),
    echeanceGlobaleLe,
    termineeLe: null,
  };
}

/**
 * Fin prévue d'une session (spec §4.3, D2) : départ + durée globale, ou + somme des durées des
 * questions, avec tiers-temps si au moins un participant y a droit ; null sans chrono.
 */
export function finPrevue(
  modeChrono: ModeChrono,
  dureeGlobaleS: number | null,
  dureesS: readonly (number | null)[],
  avecTiersTemps: boolean,
  demarreLe: Date,
): Date | null {
  if (modeChrono === "global") {
    if (dureeGlobaleS === null) throw new Error("Durée globale absente.");
    return ajouter(demarreLe, dureeMs(dureeGlobaleS, avecTiersTemps));
  }
  if (modeChrono === "par_question") {
    let total = 0;
    for (const [index, duree] of dureesS.entries()) {
      if (duree === null) throw new Error(`Durée absente pour la question ${index + 1}.`);
      total += dureeMs(duree, avecTiersTemps);
    }
    return ajouter(demarreLe, total);
  }
  return null;
}

/** Instant d'expiration d'une échéance : sa valeur plus la tolérance réseau (A3). */
export function expiration(echeance: Date): Date {
  return ajouter(echeance, TOLERANCE_ECHEANCE_MS);
}

/** Vrai si `echeance` est échue à `instant` : strictement après son expiration. */
export function echue(echeance: Date | null, instant: Date): boolean {
  return echeance !== null && instant.getTime() > expiration(echeance).getTime();
}

function expirationSiEchue(echeance: Date | null, instant: Date): Date | null {
  return echeance !== null && echue(echeance, instant) ? expiration(echeance) : null;
}

/**
 * Question courante validée à `le` (par l'étudiant ou à son échéance) : la suivante est servie
 * aussitôt. Après la dernière, ou si l'échéance globale est dépassée à `le`, l'examen est terminé et
 * les questions restantes sont closes sans réponse (« fin », D2).
 */
export function apresValidation(
  etat: EtatPassage,
  chrono: ChronoPassage,
  total: number,
  le: Date,
): Rattrapage {
  const suivant = etat.indexCourant + 1;
  const tempsEcoule = etat.echeanceGlobaleLe !== null && le.getTime() > etat.echeanceGlobaleLe.getTime();
  if (suivant >= total || tempsEcoule) {
    const clotures: Cloture[] = [];
    for (let index = suivant; index < total; index += 1) clotures.push({ index, origine: "fin", le });
    return { etat: { ...etat, indexCourant: total, echeanceQuestionLe: null, termineeLe: le }, clotures };
  }
  return {
    etat: {
      ...etat,
      indexCourant: suivant,
      questionServieLe: le,
      echeanceQuestionLe: echeanceQuestion(chrono, suivant, le),
    },
    clotures: [],
  };
}

/**
 * Fin de l'examen à `le` (échéance globale ; « Terminer pour tous » au lot 6) : la question courante
 * est validée avec sa dernière sélection (« echeance »), les suivantes restent sans réponse (« fin »).
 */
export function terminer(etat: EtatPassage, total: number, le: Date): Rattrapage {
  if (etat.termineeLe !== null) return { etat, clotures: [] };
  const clotures: Cloture[] = [];
  for (let index = etat.indexCourant; index < total; index += 1) {
    clotures.push({ index, origine: index === etat.indexCourant ? "echeance" : "fin", le });
  }
  return { etat: { ...etat, indexCourant: total, echeanceQuestionLe: null, termineeLe: le }, clotures };
}

/**
 * Rattrapage des échéances à `instant` (spec §6.5, A3) : questions échues validées avec leur dernière
 * sélection, suivantes servies à l'instant d'expiration, examen terminé à l'expiration de l'échéance
 * globale (si elle vient avant celle de la question) ou après la dernière question.
 */
export function appliquer(
  etat: EtatPassage,
  chrono: ChronoPassage,
  total: number,
  instant: Date,
): Rattrapage {
  let courant = etat;
  const clotures: Cloture[] = [];
  while (courant.termineeLe === null) {
    const globale = expirationSiEchue(courant.echeanceGlobaleLe, instant);
    const question = expirationSiEchue(courant.echeanceQuestionLe, instant);
    if (globale !== null && (question === null || globale.getTime() <= question.getTime())) {
      const fin = terminer(courant, total, globale);
      return { etat: fin.etat, clotures: [...clotures, ...fin.clotures] };
    }
    if (question === null) break;
    clotures.push({ index: courant.indexCourant, origine: "echeance", le: question });
    const suite = apresValidation(courant, chrono, total, question);
    clotures.push(...suite.clotures);
    courant = suite.etat;
  }
  return { etat: courant, clotures };
}
