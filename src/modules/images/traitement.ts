/**
 * Ré-encodage d'une image téléversée (spec §9.1 ; amendement A1 et décision D14 du plan du lot 3) :
 * signature des octets, format confirmé par sharp, image animée refusée, orientation EXIF appliquée,
 * WebP de 1 600 px au plus sur le plus grand côté, sans métadonnées (sharp les retire par défaut).
 */
import "server-only";
// Types nommés importés à part : le module ESM de sharp 0.35 n'exporte à l'exécution que la fonction par défaut.
import sharp, { type Metadata } from "sharp";
import { erreurs } from "@/lib/erreurs";
import { COTE_MAX_IMAGE, MESSAGES_IMAGE, PIXELS_MAX_IMAGE } from "@/lib/images";
import { formatDepuisSignature } from "./signature";

// Pas de cache de fichiers décodés : un serveur qui traite des envois ponctuels n'en tire rien.
sharp.cache(false);

export type ImageTraitee = { contenu: Buffer; largeur: number; hauteur: number };

export async function traiterImage(octets: Uint8Array): Promise<ImageTraitee> {
  const format = formatDepuisSignature(octets);
  if (!format) throw erreurs.validation(MESSAGES_IMAGE.format);

  let metadonnees: Metadata;
  try {
    metadonnees = await sharp(octets, { limitInputPixels: PIXELS_MAX_IMAGE }).metadata();
  } catch {
    throw erreurs.validation(MESSAGES_IMAGE.illisible);
  }
  // sharp reconnaît le format par lui-même : il doit confirmer la signature.
  if (metadonnees.format !== format) throw erreurs.validation(MESSAGES_IMAGE.format);
  if ((metadonnees.pages ?? 1) > 1) throw erreurs.validation(MESSAGES_IMAGE.animee);

  try {
    const { data, info } = await sharp(octets, { limitInputPixels: PIXELS_MAX_IMAGE, autoOrient: true })
      .resize({ width: COTE_MAX_IMAGE, height: COTE_MAX_IMAGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    return { contenu: data, largeur: info.width, hauteur: info.height };
  } catch {
    throw erreurs.validation(MESSAGES_IMAGE.illisible);
  }
}
