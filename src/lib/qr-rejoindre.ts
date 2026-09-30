/**
 * Code de session tiré d'un QR code scanné (spec §1.2, point 13 ; décision D5 du plan du lot 9). Le QR
 * projeté porte `<APP_URL>/rejoindre#K7M4QP`. On n'en garde que le code, et seulement pour une adresse
 * de la même origine et du chemin `/rejoindre` : l'adresse lue n'est jamais suivie. Le serveur normalise
 * et vérifie ensuite le code, comme une saisie.
 */

export const MESSAGE_QR_ETRANGER =
  "Ce QR code ne mène pas à un examen Carreau : scanne celui projeté au tableau.";

export const MESSAGE_SANS_CAMERA = "Aucune caméra n’est disponible : saisis le code affiché au tableau.";

export const MESSAGE_CAMERA_REFUSEE =
  "Carreau n’a pas accès à la caméra : autorise-la dans les réglages du navigateur, ou saisis le code affiché au tableau.";

/** Un code plausible : 1 à 12 chiffres ou lettres latines ; le serveur décide s'il est valable. */
const FORMAT_CODE_LU = /^[0-9A-Za-z]{1,12}$/;

/** Code du QR code `texte` lu sur une page d'origine `origine`, ou null s'il ne mène pas à `/rejoindre`. */
export function codeDepuisQr(texte: string, origine: string): string | null {
  let adresse: URL;
  try {
    adresse = new URL(texte.trim());
  } catch {
    return null;
  }
  if (adresse.origin !== origine || adresse.pathname !== "/rejoindre") return null;
  let fragment: string;
  try {
    fragment = decodeURIComponent(adresse.hash.slice(1)).trim();
  } catch {
    return null;
  }
  return FORMAT_CODE_LU.test(fragment) ? fragment : null;
}
