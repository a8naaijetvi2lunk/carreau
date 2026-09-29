/** Barème d'une question (décisions D3 et D11 du plan du lot 3) : saisie et affichage au format français. */

/** Signe moins typographique (U+2212), jamais écrit en clair dans le code. */
const MOINS = String.fromCharCode(0x2212);

export type SortePoints = "bonne" | "mauvaise" | "vide";

export const POINTS_MAX = 100;

export const MESSAGE_POINTS_NOMBRE = "Nombre attendu, par exemple 1 ou -0,25.";

const MESSAGES_BORNES: Record<SortePoints, string> = {
  bonne: `Les points d'une bonne réponse vont de 0,01 à ${POINTS_MAX}.`,
  mauvaise: `Les points d'une mauvaise réponse vont de ${MOINS}${POINTS_MAX} à 0.`,
  vide: `Les points sans réponse vont de ${MOINS}${POINTS_MAX} à 0.`,
};

/** « +1 », « -0,25 » (trait d'union ou signe moins typographique) ou « 0.5 » → nombre ; null si la saisie n'est pas un nombre décimal. */
export function lirePoints(texte: string): number | null {
  const normalise = texte.replaceAll(MOINS, "-").replace(",", ".").replace(/\s+/g, "");
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(normalise)) return null;
  const valeur = Number(normalise);
  return Number.isFinite(valeur) ? valeur : null;
}

/** Comparaison tolérante à l'arrondi binaire (0,29 × 100 = 28,999…). */
function auPlusDeuxDecimales(valeur: number): boolean {
  return Math.abs(Math.round(valeur * 100) - valeur * 100) < 1e-6;
}

/** Problème des points d'une sorte de réponse, ou null s'ils sont acceptables. */
export function problemePoints(valeur: number, sorte: SortePoints): string | null {
  if (!Number.isFinite(valeur)) return MESSAGE_POINTS_NOMBRE;
  const dansLesBornes =
    sorte === "bonne" ? valeur > 0 && valeur <= POINTS_MAX : valeur >= -POINTS_MAX && valeur <= 0;
  if (!dansLesBornes) return MESSAGES_BORNES[sorte];
  if (!auPlusDeuxDecimales(valeur)) return "Deux décimales au plus.";
  return null;
}

/** 1 → « +1 », -0,25 → « 0,25 » précédé du signe moins typographique, 0 → « 0 » (maquette « Éditeur de QCM »). */
export function formaterPoints(valeur: number): string {
  const centiemes = Math.round(valeur * 100);
  const texte = String(Math.abs(centiemes) / 100).replace(".", ",");
  if (centiemes > 0) return `+${texte}`;
  if (centiemes < 0) return `${MOINS}${texte}`;
  return "0";
}

/** « 1 pt », « 0,5 pt », « 2 pts » (liste des questions). */
export function libellePoints(valeur: number): string {
  const texte = formaterPoints(valeur).replace(/^\+/, "");
  return `${texte} ${Math.abs(valeur) >= 2 ? "pts" : "pt"}`;
}
