/**
 * Règles de la surveillance (spec §8 ; décisions D2, D4, D5, D10, D11 et D15 du plan du lot 6) :
 * types d'événements, seuils, pondération v1 de l'indice et libellés montrés à l'enseignant. Aucun de
 * ces textes n'est affiché à l'étudiant.
 */
import { formaterHeureSecondes } from "./dates";

/** Ce que le téléphone peut signaler (D2) : jamais une heure ni une durée. */
export const TYPES_EVENEMENT_TELEPHONE = [
  "debut",
  "masquee",
  "visible",
  "focus_perdu",
  "focus_revenu",
  "copie",
  "coupe",
  "colle",
  "ecran_partage",
  "hors_ligne",
  "en_ligne",
] as const;
export type TypeEvenementTelephone = (typeof TYPES_EVENEMENT_TELEPHONE)[number];

/** Silence : aucun contact pendant plus de 15 s pendant l'examen (spec §8.2, D3). */
export const SEUIL_SILENCE_MS = 15_000;
/** Événements du téléphone qui expliquent un silence : reçus jusqu'à 10 s après sa fin (D4). */
export const FENETRE_EXPLICATION_MS = 10_000;
/** Intervalle ignoré : événements mis en file puis reçus ensemble (D4). */
export const INTERVALLE_MIN_MS = 1_000;
export const LOT_EVENEMENTS_MAX = 50;
export const TAILLE_MAX_CORPS_EVENEMENTS = 4096;
/** Événements du téléphone gardés par passage : au-delà, un lot n'enregistre rien (base et tableau de bord protégés). */
export const EVENEMENTS_MAX_PAR_PASSAGE = 1000;
export const MESSAGE_EVENEMENTS_INVALIDES = "Événements invalides.";

/** Lot envoyé par la page d'examen (D7) : un numéro croissant par événement, jamais d'heure ni de durée. */
export type LotEvenementsTelephone = {
  chargement: string;
  evenements: { n: number; type: TypeEvenementTelephone }[];
};
/** Bandeau du téléphone : sortie terminée depuis moins de 30 s et d'au moins 2 s (D15). */
export const BANDEAU_SORTIE_MS = 30_000;
export const BANDEAU_SORTIE_MIN_MS = 2_000;

/** Pondération de l'indice (spec §8.4) : une version, stockée avec l'indice. */
export type Ponderation = {
  version: number;
  sortieMin: number;
  sortieMax: number;
  focusMinMs: number;
  focus: number;
  pressePapiers: number;
  reponseRapideSortieMinMs: number;
  reponseRapideDelaiMs: number;
  reponseRapide: number;
  secondAppareil: number;
  ecranPartage: number;
  plafond: number;
};

export const PONDERATION_V1: Ponderation = {
  version: 1,
  sortieMin: 5,
  sortieMax: 45,
  focusMinMs: 2_000,
  focus: 6,
  pressePapiers: 10,
  reponseRapideSortieMinMs: 5_000,
  reponseRapideDelaiMs: 10_000,
  reponseRapide: 12,
  secondAppareil: 20,
  ecranPartage: 5,
  plafond: 100,
};

/** Signaux du détail de l'indice, dans l'ordre d'affichage (D5). */
export const SIGNAUX = [
  "sortie",
  "focus",
  "presse_papiers",
  "reponse_rapide",
  "second_appareil",
  "ecran_partage",
  "coupure",
  "rechargement",
  "appareil_autorise",
] as const;
export type Signal = (typeof SIGNAUX)[number];

export const LIBELLES_SIGNAL: Record<Signal, string> = {
  sortie: "Sortie de l’application",
  focus: "Perte de focus",
  presse_papiers: "Copier, couper ou coller",
  reponse_rapide: "Réponse rapide après une sortie",
  second_appareil: "Tentative depuis un second appareil",
  ecran_partage: "Écran partagé (heuristique)",
  coupure: "Coupure réseau (non comptée)",
  rechargement: "Rechargement de la page (non compté)",
  appareil_autorise: "Changement de téléphone autorisé (non compté)",
};

export type LigneIndice = { signal: Signal; nombre: number; points: number };

export const MENTION_INDICE =
  "L’indice de suspicion est une estimation calculée à partir des événements enregistrés. Ce n’est pas une preuve. Les coupures réseau ne sont pas comptées.";

export type TypeFait =
  | "sortie"
  | "focus"
  | "presse_papiers"
  | "ecran_partage"
  | "coupure"
  | "second_appareil"
  | "rechargement"
  | "appareil_autorise";

/** Fait notable d'un passage, tiré de la consolidation (D10). */
export type Fait = { type: TypeFait; le: Date; dureeMs: number | null; questionIndex: number | null };

function secondes(fait: Fait): number {
  return Math.round((fait.dureeMs ?? 0) / 1000);
}

/** Dernier événement d'un participant (maquette « Suivi en direct », D11). */
export function libelleFait(fait: Fait): string {
  const heure = formaterHeureSecondes(fait.le);
  const question = fait.questionIndex === null ? "" : ` · Q${fait.questionIndex + 1}`;
  switch (fait.type) {
    case "sortie":
      return `Sortie ${secondes(fait)} s${question} · ${heure}`;
    case "focus":
      return `Perte de focus ${secondes(fait)} s${question}`;
    case "presse_papiers":
      return `Copier-coller${question} · ${heure}`;
    case "ecran_partage":
      return `Écran partagé${question} · ${heure}`;
    case "coupure":
      return `Réseau perdu · ${heure}`;
    case "second_appareil":
      return `2e appareil · ${heure}`;
    case "appareil_autorise":
      return `Téléphone changé · ${heure}`;
    case "rechargement":
      return `Rechargement · ${heure}`;
  }
}

/** Alerte en direct (D11) ; null pour les faits qui n'en donnent pas (focus, second appareil, rechargement). */
export function alerteFait(fait: Fait, nom: string): { titre: string; detail: string } | null {
  const pendant =
    fait.questionIndex === null ? `${nom}.` : `${nom} — pendant la question ${fait.questionIndex + 1}.`;
  switch (fait.type) {
    case "sortie":
      return { titre: `Sortie de l’application · ${secondes(fait)} s`, detail: pendant };
    case "ecran_partage":
      return { titre: "Écran partagé détecté", detail: pendant };
    case "presse_papiers":
      return { titre: "Copier-coller", detail: pendant };
    case "coupure":
      return { titre: "Connexion perdue", detail: `${nom} — coupure réseau, non comptée dans l’indice.` };
    default:
      return null;
  }
}
