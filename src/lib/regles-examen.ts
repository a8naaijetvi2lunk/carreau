/**
 * Règles du passage de l'examen (spec §4.3, §6.4 à §6.6 et §7 ; plan du lot 5) : origines d'une
 * réponse, tolérance des échéances, délais. Pure et sans import : le schéma de la base l'importe par
 * un chemin relatif (drizzle-kit charge le schéma sans les alias de tsconfig.json).
 */

/** Réponse validée par l'étudiant, à l'échéance (dernière sélection) ou à la fin (sans réponse). */
export const ORIGINES_REPONSE = ["validation", "echeance", "fin"] as const;
export type OrigineReponse = (typeof ORIGINES_REPONSE)[number];

/** Une échéance devient effective 3 s après sa valeur (spec §6.5, amendement A3). */
export const TOLERANCE_ECHEANCE_MS = 3_000;

/** Une session dont la fin prévue est passée de 10 min passe en « terminée » (spec §6.5, D10). */
export const DELAI_CLOTURE_MS = 10 * 60_000;

/** Période de l'état du téléphone pendant l'examen (spec §7). */
export const PERIODE_EXAMEN_MS = 5_000;

/** Messages des états impossibles de l'examen (spec §12, décisions D7 et D8). */
export const MESSAGES_EXAMEN = {
  pasCourante: "Cette question n'est plus modifiable : elle a déjà été validée ou son temps est écoulé.",
  pasOuverte: "Cette question n'est pas encore ouverte.",
  selectionInvalide: "Ta sélection n'est pas valide : touche de nouveau tes réponses.",
  uneSeule: "Une seule réponse est possible pour cette question.",
} as const;
