/**
 * Fichiers des images sous `IMAGES_DIR` (spec §4.2) : `<uuid>.webp`, écrits dans un fichier
 * temporaire puis renommés (jamais de fichier à moitié écrit sous son nom définitif).
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

const FORMAT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Dossier absolu des images (créé si absent) : `IMAGES_DIR` peut être relatif en développement. */
export async function dossierImages(): Promise<string> {
  const dossier = path.resolve(env().IMAGES_DIR);
  await mkdir(dossier, { recursive: true });
  return dossier;
}

function cheminImage(dossier: string, id: string): string {
  // Défense en profondeur : l'identifiant vient de randomUUID ou de la base, jamais d'un nom de fichier envoyé.
  if (!FORMAT_ID.test(id)) throw new Error("Identifiant d'image invalide.");
  return path.join(dossier, `${id}.webp`);
}

function estAbsent(erreur: unknown): boolean {
  return (erreur as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

export async function ecrireFichierImage(id: string, contenu: Uint8Array): Promise<void> {
  const dossier = await dossierImages();
  const final = cheminImage(dossier, id);
  const temporaire = path.join(dossier, `.televersement-${randomUUID()}.tmp`);
  try {
    await writeFile(temporaire, contenu, { flag: "wx" });
    await rename(temporaire, final);
  } catch (erreur) {
    await unlink(temporaire).catch(() => undefined);
    throw erreur;
  }
}

/** Contenu du fichier, ou null s'il n'existe pas. */
export async function lireFichierImage(id: string): Promise<Buffer | null> {
  try {
    return await readFile(cheminImage(await dossierImages(), id));
  } catch (erreur) {
    if (estAbsent(erreur)) return null;
    throw erreur;
  }
}

export async function supprimerFichierImage(id: string): Promise<void> {
  try {
    await unlink(cheminImage(await dossierImages(), id));
  } catch (erreur) {
    if (!estAbsent(erreur)) throw erreur;
  }
}
