// Sauvegarde quotidienne des images (spec §14, lot 10 ; décision D7 et amendement A6 du plan) :
//
//   node scripts/sauvegarder-images.mjs
//
// Lancé dans le conteneur par la tâche planifiée de Coolify. Écrit SAUVEGARDES_DIR/images-AAAA-MM-JJ.tar.gz
// (date UTC) avec la commande tar de l'image, par un fichier temporaire puis un renommage, et ne garde
// que les 14 archives les plus récentes. Prévu pour le tar de l'image alpine (busybox) : sous Windows,
// le tar de Git Bash lit « C: » comme un nom d'hôte. Variables : IMAGES_DIR, SAUVEGARDES_DIR.
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const ARCHIVES_GARDEES = 14;
const FORMAT_ARCHIVE = /^images-\d{4}-\d{2}-\d{2}\.tar\.gz$/;

/**
 * Nom de l'archive du jour, d'après la date UTC.
 * @param {Date} instant
 * @returns {string}
 */
export function nomArchive(instant) {
  return `images-${instant.toISOString().slice(0, 10)}.tar.gz`;
}

/**
 * Archives à supprimer : toutes celles au format attendu, sauf les `garder` plus récentes (l'ordre
 * des noms est celui des dates). Tout autre fichier est ignoré.
 * @param {string[]} noms
 * @param {number} [garder]
 * @returns {string[]}
 */
export function archivesARetirer(noms, garder = ARCHIVES_GARDEES) {
  return noms
    .filter((nom) => FORMAT_ARCHIVE.test(nom))
    .sort()
    .reverse()
    .slice(garder);
}

function main() {
  const images = process.env.IMAGES_DIR;
  const sauvegardes = process.env.SAUVEGARDES_DIR;
  if (!images || !sauvegardes) {
    console.error("[sauvegarder-images] IMAGES_DIR et SAUVEGARDES_DIR sont requis.");
    process.exitCode = 1;
    return;
  }
  const dossierImages = path.resolve(images);
  const dossier = path.resolve(sauvegardes);
  mkdirSync(dossierImages, { recursive: true });
  mkdirSync(dossier, { recursive: true });

  const nom = nomArchive(new Date());
  const final = path.join(dossier, nom);
  const temporaire = path.join(dossier, `.${nom}.tmp`);
  const resultat = spawnSync("tar", ["-czf", temporaire, "-C", dossierImages, "."], { encoding: "utf8" });
  if (resultat.status !== 0) {
    rmSync(temporaire, { force: true });
    const cause = resultat.error?.message ?? resultat.stderr.trim();
    console.error(`[sauvegarder-images] Échec de tar : ${cause}`);
    process.exitCode = 1;
    return;
  }
  renameSync(temporaire, final);

  const retirees = archivesARetirer(readdirSync(dossier));
  for (const ancienne of retirees) rmSync(path.join(dossier, ancienne), { force: true });
  console.log(
    `[sauvegarder-images] ${nom} : ${statSync(final).size} octets ; ${retirees.length} ancienne(s) archive(s) retirée(s).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
