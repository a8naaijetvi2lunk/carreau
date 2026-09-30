// Identité visuelle (lot 9, décision D2) : dérive toutes les tailles d'icône de la source retenue.
//
//   npm run icones
//
// Source : docs/identite/carreau-icone-source.png, 1024 × 1024, fond opaque, générée par Codex
// (imagegen) et choisie par Yves. Les fichiers produits sont versionnés ; relancer le script après
// tout changement de la source.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(RACINE, "docs/identite/carreau-icone-source.png");

/**
 * Conteneur ICO d'images PNG (admis par Windows depuis Vista et par tous les navigateurs) : en-tête de
 * 6 octets, une entrée de 16 octets par image, puis les PNG bout à bout. `sharp` n'écrit pas d'ICO.
 * @param {{ taille: number; png: Buffer }[]} images
 * @returns {Buffer}
 */
export function encoderIco(images) {
  const entete = Buffer.alloc(6);
  entete.writeUInt16LE(0, 0);
  entete.writeUInt16LE(1, 2);
  entete.writeUInt16LE(images.length, 4);
  let decalage = 6 + 16 * images.length;
  const entrees = images.map(({ taille, png }) => {
    const entree = Buffer.alloc(16);
    // Largeur et hauteur : 0 signifie 256.
    entree.writeUInt8(taille >= 256 ? 0 : taille, 0);
    entree.writeUInt8(taille >= 256 ? 0 : taille, 1);
    entree.writeUInt8(0, 2);
    entree.writeUInt8(0, 3);
    entree.writeUInt16LE(1, 4);
    entree.writeUInt16LE(32, 6);
    entree.writeUInt32LE(png.length, 8);
    entree.writeUInt32LE(decalage, 12);
    decalage += png.length;
    return entree;
  });
  return Buffer.concat([entete, ...entrees, ...images.map((image) => image.png)]);
}

/** Couleur du fond, prise à 32 px du bord (le tout premier pixel de l'image générée peut être altéré). */
async function couleurDeFond() {
  const { data } = await sharp(SOURCE)
    .extract({ left: 32, top: 32, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { r: data[0], g: data[1], b: data[2] };
}

async function png(taille) {
  return sharp(SOURCE).resize(taille, taille).png({ compressionLevel: 9 }).toBuffer();
}

/** Icône adaptative d'Android : l'icône réduite à 80 %, centrée sur son fond (zone sûre). */
async function adaptative(fond) {
  return sharp(SOURCE)
    .resize(410, 410)
    .extend({ top: 51, bottom: 51, left: 51, right: 51, background: fond })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Marque de l'interface : le motif recadré, avec une marge de 12 %, en 96 × 96 (affiché à 24 px). */
async function marque(fond) {
  const interieur = await sharp(SOURCE).extract({ left: 8, top: 8, width: 1008, height: 1008 }).toBuffer();
  const motif = await sharp(interieur).trim({ background: fond, threshold: 40 }).toBuffer();
  const { width = 96, height = 96 } = await sharp(motif).metadata();
  const marge = Math.round(Math.max(width, height) * 0.12);
  // Étape intermédiaire matérialisée : chaîner extend() et resize({ fit: "contain" }) dans un même
  // pipeline sharp (0.35.5) produit une image de 256 × 256 au lieu de 96 × 96 (constaté, non documenté).
  const etendu = await sharp(motif)
    .extend({ top: marge, bottom: marge, left: marge, right: marge, background: fond })
    .toBuffer();
  return sharp(etendu)
    .resize(96, 96, { fit: "contain", background: fond })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  const fond = await couleurDeFond();
  mkdirSync(path.join(RACINE, "public/icons"), { recursive: true });
  const fichiers = {
    "public/icons/icon-192.png": await png(192),
    "public/icons/icon-512.png": await png(512),
    "public/icons/icon-maskable-512.png": await adaptative(fond),
    "public/marque.png": await marque(fond),
    "src/app/apple-icon.png": await png(180),
    "src/app/favicon.ico": encoderIco([
      { taille: 16, png: await png(16) },
      { taille: 32, png: await png(32) },
      { taille: 48, png: await png(48) },
    ]),
  };
  for (const [relatif, contenu] of Object.entries(fichiers)) {
    writeFileSync(path.join(RACINE, relatif), contenu);
    console.log(`${relatif} : ${contenu.length} octets`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erreur) => {
    console.error(`[icones] Échec : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    process.exitCode = 1;
  });
}
