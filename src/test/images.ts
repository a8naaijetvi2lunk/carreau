/** Images de test fabriquées par sharp, dossier d'images temporaire et lignes `image` insérées directement. */
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { crc32 } from "node:zlib";
import sharp from "sharp";
import { afterAll, beforeAll } from "vitest";
import { db } from "@/db";
import { image } from "@/db/schema";
import { reinitialiserEnvPourLesTests } from "@/lib/env";
import { maintenant } from "@/lib/horloge";
import { exiger } from "./comptes";

/**
 * IMAGES_DIR pointé sur un dossier temporaire propre au fichier de test, supprimé à la fin.
 * Renvoie une fonction qui donne ce dossier (connu seulement après `beforeAll`).
 */
export function utiliserDossierImagesTemporaire(): () => string {
  let dossier = "";
  let precedent: string | undefined;
  beforeAll(async () => {
    dossier = await mkdtemp(path.join(os.tmpdir(), "carreau-images-"));
    precedent = process.env.IMAGES_DIR;
    process.env.IMAGES_DIR = dossier;
    reinitialiserEnvPourLesTests();
  });
  afterAll(async () => {
    process.env.IMAGES_DIR = precedent;
    reinitialiserEnvPourLesTests();
    await rm(dossier, { recursive: true, force: true });
  });
  return () => dossier;
}

type OptionsImage = { largeur?: number; hauteur?: number };

function toile({ largeur = 64, hauteur = 48 }: OptionsImage) {
  return sharp({ create: { width: largeur, height: hauteur, channels: 3, background: "#2344c4" } });
}

export async function imagePng(options: OptionsImage = {}): Promise<Uint8Array> {
  return new Uint8Array(await toile(options).png().toBuffer());
}

/** JPEG, avec éventuellement une orientation EXIF (6 : à tourner de 90° dans le sens horaire). */
export async function imageJpeg(options: OptionsImage & { orientation?: number } = {}): Promise<Uint8Array> {
  const jpeg = toile(options).jpeg();
  const avecExif = options.orientation ? jpeg.withMetadata({ orientation: options.orientation }) : jpeg;
  return new Uint8Array(await avecExif.toBuffer());
}

export async function imageWebp(options: OptionsImage = {}): Promise<Uint8Array> {
  return new Uint8Array(await toile(options).webp().toBuffer());
}

export async function imageGif(options: OptionsImage = {}): Promise<Uint8Array> {
  return new Uint8Array(await toile(options).gif().toBuffer());
}

/** GIF animé de deux images. */
export async function gifAnime(): Promise<Uint8Array> {
  const cadre = (couleur: string) =>
    sharp({ create: { width: 32, height: 32, channels: 3, background: couleur } })
      .png()
      .toBuffer();
  const cadres = [await cadre("#2344c4"), await cadre("#b3470a")];
  return new Uint8Array(
    await sharp(cadres, { join: { animated: true } })
      .gif()
      .toBuffer(),
  );
}

/**
 * PNG valide de 1 × 1 dont l'en-tête annonce `largeur × hauteur` (somme de contrôle recalculée) :
 * de quoi tester la limite de pixels sans allouer une image géante.
 */
export async function pngAnnoncant(largeur: number, hauteur: number): Promise<Uint8Array> {
  const octets = new Uint8Array(await imagePng({ largeur: 1, hauteur: 1 }));
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  // Signature (8) + longueur (4) + « IHDR » (4) : largeur à 16, hauteur à 20, CRC de IHDR à 29.
  vue.setUint32(16, largeur);
  vue.setUint32(20, hauteur);
  vue.setUint32(29, crc32(octets.subarray(12, 29)));
  return octets;
}

/** Ligne `image` sans fichier (les tests des QCM n'ont besoin que de la ligne). */
export async function creerImageTest(enseignantId: string, options: OptionsImage = {}) {
  const [creee] = await db()
    .insert(image)
    .values({
      id: randomUUID(),
      enseignantId,
      largeur: options.largeur ?? 640,
      hauteur: options.hauteur ?? 480,
      octets: 1000,
      creeLe: maintenant(),
    })
    .returning();
  return exiger(creee, "image");
}
