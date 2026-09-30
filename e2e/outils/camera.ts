/** Caméra factice des tests du scanner (Chromium) : une vidéo Y4M qui montre un QR code. */
import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import QRCode from "qrcode";

/**
 * Écrit dans le dossier temporaire une vidéo Y4M (640 × 480, 5 images en niveaux de gris) qui montre le
 * QR code de `texte`, et renvoie son chemin. À appeler au chargement du fichier de test : Chromium lit
 * la vidéo dès son lancement (`--use-file-for-fake-video-capture`).
 */
export function videoQr(texte: string, nom: string): string {
  const largeur = 640;
  const hauteur = 480;
  const qr = QRCode.create(texte, { errorCorrectionLevel: "M" });
  const modules = qr.modules.size;
  const marge = 4;
  const cote = Math.floor(400 / (modules + 2 * marge));
  const taille = cote * (modules + 2 * marge);
  const gauche = Math.floor((largeur - taille) / 2);
  const haut = Math.floor((hauteur - taille) / 2);
  // Plan de luminance : fond clair (235), modules noirs (16) ; chrominance neutre (128).
  const luminance = Buffer.alloc(largeur * hauteur, 235);
  for (let ligne = 0; ligne < modules; ligne += 1) {
    for (let colonne = 0; colonne < modules; colonne += 1) {
      if (!qr.modules.get(ligne, colonne)) continue;
      for (let dy = 0; dy < cote; dy += 1) {
        const debut = (haut + (ligne + marge) * cote + dy) * largeur + gauche + (colonne + marge) * cote;
        luminance.fill(16, debut, debut + cote);
      }
    }
  }
  const chrominance = Buffer.alloc((largeur / 2) * (hauteur / 2) * 2, 128);
  const morceaux = [Buffer.from(`YUV4MPEG2 W${largeur} H${hauteur} F10:1 Ip A1:1 C420jpeg\n`)];
  for (let image = 0; image < 5; image += 1) morceaux.push(Buffer.from("FRAME\n"), luminance, chrominance);
  const chemin = path.join(os.tmpdir(), nom);
  writeFileSync(chemin, Buffer.concat(morceaux));
  return chemin;
}
