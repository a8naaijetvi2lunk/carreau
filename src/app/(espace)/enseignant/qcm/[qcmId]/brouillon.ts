/**
 * Question en cours d'édition (décisions D8 et D10 du plan du lot 3) : état local de l'éditeur et
 * passage à la saisie envoyée au serveur. Fonctions pures, testées sans navigateur.
 */
import type { ImageVue } from "@/lib/images";
import {
  formaterPoints,
  lirePoints,
  MESSAGE_POINTS_NOMBRE,
  problemePoints,
  type SortePoints,
} from "@/lib/points";
import {
  MESSAGE_DUREE_QUESTION,
  problemeDureeQuestionS,
  type LangageCode,
  type QuestionRegle,
  type TypeQuestion,
} from "@/lib/regles-qcm";
import type { QuestionEditee, SaisieQuestion } from "@/modules/qcm";

/** Réponse en cours d'édition ; `cle` ne sert qu'à React (les réponses sont remplacées en bloc). */
export type PropositionBrouillon = { cle: string; texte: string; image: ImageVue | null; correcte: boolean };

export type Brouillon = {
  type: TypeQuestion;
  enonce: string;
  image: ImageVue | null;
  code: { langage: LangageCode; source: string } | null;
  propositions: PropositionBrouillon[];
  /** Barème tel que saisi (« -0,25 »), lu au moment de l'envoi. */
  points: Record<SortePoints, string>;
  /** Surcharge de durée telle que saisie, en secondes ; vide : durée par défaut du QCM. */
  duree: string;
  /** Réponses d'avant le passage en vrai/faux, rendues si l'on rechange de type (décision D10). */
  avantVraiFaux: PropositionBrouillon[] | null;
};

export function brouillonInitial(question: QuestionEditee): Brouillon {
  return {
    type: question.type,
    enonce: question.enonce,
    image: question.image,
    code: question.code,
    propositions: question.propositions.map((p, i) => ({
      cle: `enregistree-${i}`,
      texte: p.texte,
      image: p.image,
      correcte: p.correcte,
    })),
    points: {
      bonne: formaterPoints(question.pointsBonne),
      mauvaise: formaterPoints(question.pointsMauvaise),
      vide: formaterPoints(question.pointsVide),
    },
    duree: question.dureeS === null ? "" : String(question.dureeS),
    avantVraiFaux: null,
  };
}

export function nouvelleProposition(cle: string, texte = ""): PropositionBrouillon {
  return { cle, texte, image: null, correcte: false };
}

function garderPremiereBonneReponse(propositions: PropositionBrouillon[]): PropositionBrouillon[] {
  let trouvee = false;
  return propositions.map((p) => {
    if (!p.correcte) return p;
    if (trouvee) return { ...p, correcte: false };
    trouvee = true;
    return p;
  });
}

/**
 * Change le type (décision D10) : vers vrai/faux, « Vrai » et « Faux » remplacent les réponses, gardées de
 * côté ; depuis vrai/faux, elles reviennent. Hors choix multiples, seule la première bonne réponse reste
 * cochée. `cle` fournit une clé neuve à chaque appel.
 */
export function changerType(brouillon: Brouillon, type: TypeQuestion, cle: () => string): Brouillon {
  if (type === brouillon.type) return brouillon;
  if (type === "vrai_faux") {
    return {
      ...brouillon,
      type,
      avantVraiFaux: brouillon.propositions,
      propositions: [nouvelleProposition(cle(), "Vrai"), nouvelleProposition(cle(), "Faux")],
    };
  }
  const propositions =
    brouillon.type === "vrai_faux"
      ? (brouillon.avantVraiFaux ?? brouillon.propositions)
      : brouillon.propositions;
  return {
    ...brouillon,
    type,
    avantVraiFaux: null,
    propositions: type === "multiple" ? propositions : garderPremiereBonneReponse(propositions),
  };
}

/** Coche ou décoche une réponse ; hors choix multiples, cocher une réponse décoche les autres. */
export function cocher(brouillon: Brouillon, cle: string, coche: boolean): Brouillon {
  const uneSeule = brouillon.type !== "multiple";
  return {
    ...brouillon,
    propositions: brouillon.propositions.map((p) => {
      if (p.cle === cle) return { ...p, correcte: coche };
      return uneSeule && coche ? { ...p, correcte: false } : p;
    }),
  };
}

/** Problème affiché sous un champ du barème, ou null. */
export function problemeSaisiePoints(texte: string, sorte: SortePoints): string | null {
  const valeur = lirePoints(texte);
  return valeur === null ? MESSAGE_POINTS_NOMBRE : problemePoints(valeur, sorte);
}

/** Problème affiché sous la durée d'une question, ou null (vide : durée par défaut). */
export function problemeSaisieDuree(texte: string): string | null {
  const saisie = texte.trim();
  if (saisie === "") return null;
  return /^\d+$/.test(saisie) ? problemeDureeQuestionS(Number(saisie)) : MESSAGE_DUREE_QUESTION;
}

/**
 * Brouillon → saisie envoyée au serveur (décision D8). Un barème ou une durée mal saisis gardent la
 * dernière valeur enregistrée : le reste de la question s'enregistre quand même.
 */
export function versSaisie(
  questionId: string,
  brouillon: Brouillon,
  enregistree: Pick<QuestionEditee, "pointsBonne" | "pointsMauvaise" | "pointsVide" | "dureeS">,
): SaisieQuestion {
  const points = (sorte: SortePoints, repli: number): number => {
    const valeur = lirePoints(brouillon.points[sorte]);
    return valeur !== null && problemePoints(valeur, sorte) === null ? valeur : repli;
  };
  const duree = brouillon.duree.trim();
  return {
    questionId,
    type: brouillon.type,
    enonce: brouillon.enonce,
    imageId: brouillon.image?.id ?? null,
    code: brouillon.code,
    propositions: brouillon.propositions.map((p) => ({
      texte: p.texte,
      imageId: p.image?.id ?? null,
      correcte: p.correcte,
    })),
    pointsBonne: points("bonne", enregistree.pointsBonne),
    pointsMauvaise: points("mauvaise", enregistree.pointsMauvaise),
    pointsVide: points("vide", enregistree.pointsVide),
    dureeS: duree === "" ? null : problemeSaisieDuree(duree) === null ? Number(duree) : enregistree.dureeS,
  };
}

/** Brouillon → forme attendue par les règles de complétude (problèmes affichés en direct). */
export function versRegle(brouillon: Brouillon): QuestionRegle {
  return {
    type: brouillon.type,
    enonce: brouillon.enonce,
    code: brouillon.code,
    propositions: brouillon.propositions.map((p) => ({
      texte: p.texte,
      imageId: p.image?.id ?? null,
      correcte: p.correcte,
    })),
  };
}
