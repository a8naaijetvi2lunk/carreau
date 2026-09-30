/**
 * Purge des images orphelines (spec §14, lot 10 ; décision D3 du plan). Fonction système, sans
 * acteur : seul le module purges l'appelle. Après 24 h de grâce, une image que ne cite ni une
 * question, ni une proposition, ni l'instantané d'une session est supprimée : la ligne d'abord, en une
 * seule requête, puis son fichier. Les fichiers restés sans ligne (arrêt entre l'écriture du fichier
 * et la transaction) et les téléversements interrompus suivent la même grâce, d'après leur date.
 */
import "server-only";
import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { image } from "@/db/schema";
import { DELAI_GRACE_IMAGES_MS } from "@/lib/regles-purges";
import { dossierImages } from "./stockage";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const FICHIER_IMAGE = new RegExp(`^(${UUID})\\.webp$`);
const FICHIER_TEMPORAIRE = new RegExp(`^\\.televersement-${UUID}\\.tmp$`);

export type BilanImages = { lignes: number; fichiers: number; temporaires: number };

/** Supprime un fichier ; faux s'il n'existait déjà plus. */
async function supprimer(chemin: string): Promise<boolean> {
  try {
    await unlink(chemin);
    return true;
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw erreur;
  }
}

export async function purgerImagesOrphelines(instant: Date): Promise<BilanImages> {
  // Dossier résolu d'abord : un IMAGES_DIR inutilisable fait échouer l'étape avant toute suppression.
  const dossier = await dossierImages();
  const limite = new Date(instant.getTime() - DELAI_GRACE_IMAGES_MS);
  const limiteSql = sql`${limite.toISOString()}::timestamptz`;
  // Une seule requête : une ligne n'est supprimée que si rien ne la cite à cet instant. Une question
  // qui la cite au même moment fait échouer la requête (clé étrangère) : l'étape se refait la nuit suivante.
  const { rows } = await db().execute<{ id: string }>(sql`
    delete from image i
    where i.cree_le <= ${limiteSql}
      and not exists (select 1 from question q where q.image_id = i.id)
      and not exists (select 1 from proposition p where p.image_id = i.id)
      and not exists (
        select 1 from session_examen s
        where s.contenu is not null
          and (
            jsonb_path_exists(s.contenu, '$.questions[*].image.id ? (@ == $id)', jsonb_build_object('id', i.id::text))
            or jsonb_path_exists(
              s.contenu,
              '$.questions[*].propositions[*].image.id ? (@ == $id)',
              jsonb_build_object('id', i.id::text)
            )
          )
      )
    returning i.id`);

  let fichiers = 0;
  for (const { id } of rows) {
    if (await supprimer(path.join(dossier, `${id}.webp`))) fichiers += 1;
  }

  const connues = new Set((await db().select({ id: image.id }).from(image)).map((ligne) => ligne.id));
  let temporaires = 0;
  for (const nom of await readdir(dossier)) {
    const correspondance = FICHIER_IMAGE.exec(nom);
    const temporaire = FICHIER_TEMPORAIRE.test(nom);
    if (!correspondance && !temporaire) continue;
    if (correspondance && connues.has(correspondance[1] ?? "")) continue;
    const chemin = path.join(dossier, nom);
    if ((await stat(chemin)).mtimeMs > limite.getTime()) continue;
    if (!(await supprimer(chemin))) continue;
    if (temporaire) temporaires += 1;
    else fichiers += 1;
  }
  return { lignes: rows.length, fichiers, temporaires };
}
