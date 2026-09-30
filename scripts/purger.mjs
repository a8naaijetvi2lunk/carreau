// Déclenche les purges nocturnes (spec §2 et §14, lot 10 ; décision D6 du plan) :
//
//   node scripts/purger.mjs
//
// Lancé dans le conteneur par la tâche planifiée de Coolify (ou, à défaut, par un cron de l'hôte et
// `docker exec`). Appelle la route locale http://127.0.0.1:$PORT/api/cron/purges avec CRON_SECRET :
// l'appel ne sort pas du conteneur. Code de sortie 1 si la route refuse ou échoue, ou si une étape
// du bilan est en erreur (un bilan partiel répond 200). Variables : CRON_SECRET, PORT.
import { pathToFileURL } from "node:url";

/**
 * Code de sortie d'après la réponse de la route : 0 seulement pour un statut 2xx dont le bilan
 * n'a aucune étape en erreur.
 * @param {number} statut
 * @param {string} corps
 * @returns {number}
 */
export function codeSortie(statut, corps) {
  if (statut < 200 || statut >= 300) return 1;
  try {
    const bilan = JSON.parse(corps);
    return Array.isArray(bilan?.erreurs) && bilan.erreurs.length === 0 ? 0 : 1;
  } catch {
    return 1;
  }
}

async function main() {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[purger] CRON_SECRET manquant : purges non lancées.");
    process.exitCode = 1;
    return;
  }
  const url = `http://127.0.0.1:${process.env.PORT ?? "3000"}/api/cron/purges`;
  const debut = Date.now();
  try {
    const reponse = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(240_000),
    });
    const corps = await reponse.text();
    console.log(`[purger] ${reponse.status} en ${Date.now() - debut} ms : ${corps.slice(0, 2000)}`);
    process.exitCode = codeSortie(reponse.status, corps);
  } catch (erreur) {
    console.error(`[purger] Appel impossible : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
