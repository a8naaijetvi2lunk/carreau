/**
 * Format d'une image décidé sur ses premiers octets (amendement A1 du plan du lot 3), jamais sur
 * l'extension ni sur le type annoncé par le navigateur. Seuls les quatre formats acceptés sont
 * reconnus : un SVG, un HEIC ou tout autre fichier donne null.
 */

export type FormatImage = "png" | "jpeg" | "webp" | "gif";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const GIF87A = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61];
const GIF89A = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

function commencePar(octets: Uint8Array, attendus: readonly number[], decalage = 0): boolean {
  return (
    octets.length >= decalage + attendus.length &&
    attendus.every((octet, i) => octets[decalage + i] === octet)
  );
}

export function formatDepuisSignature(octets: Uint8Array): FormatImage | null {
  if (commencePar(octets, PNG)) return "png";
  if (commencePar(octets, JPEG)) return "jpeg";
  if (commencePar(octets, GIF87A) || commencePar(octets, GIF89A)) return "gif";
  // WebP : conteneur RIFF (4 octets), taille (4 octets), puis « WEBP ».
  if (commencePar(octets, RIFF) && commencePar(octets, WEBP, 8)) return "webp";
  return null;
}
