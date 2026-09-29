/**
 * Images des QCM (spec §9.1, décision D14 du plan du lot 3) : bornes et messages partagés par le
 * service `images` et par l'éditeur (contrôle de taille avant l'envoi).
 */

/** Taille maximale à l'entrée : 5 Mo. */
export const TAILLE_MAX_IMAGE_OCTETS = 5 * 1024 * 1024;

/** Plus grand côté de l'image ré-encodée, en pixels. */
export const COTE_MAX_IMAGE = 1600;

/** Nombre de pixels au plus à l'entrée (largeur × hauteur annoncées) : borne la mémoire du décodage. */
export const PIXELS_MAX_IMAGE = 40_000_000;

export const MAX_IMAGES_PAR_COMPTE = 2000;

/** Types proposés par le sélecteur de fichier ; le serveur décide sur les octets. */
export const TYPES_IMAGE_ACCEPTES = "image/png,image/jpeg,image/webp,image/gif";

export const MESSAGES_IMAGE = {
  vide: "Le fichier est vide.",
  tropLourde: "Image trop lourde : 5 Mo au maximum.",
  format: "Format d'image non pris en charge : utilise une image PNG, JPEG, WebP ou GIF.",
  animee: "Les images animées ne sont pas acceptées : utilise une image fixe.",
  illisible: "Image illisible ou trop grande (40 millions de pixels au plus).",
  limite: `Tu as atteint la limite de ${MAX_IMAGES_PAR_COMPTE} images.`,
} as const;

/** Image enregistrée : identifiant et dimensions après ré-encodage. */
export type ImageVue = { id: string; largeur: number; hauteur: number };

/** Adresse de lecture contrôlée d'une image (route `GET /api/images/[imageId]`). */
export function urlImage(id: string): string {
  return `/api/images/${id}`;
}
