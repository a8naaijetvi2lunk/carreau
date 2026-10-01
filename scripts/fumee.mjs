// Tests de fumée d'une instance en ligne (spec §14, lot 10 ; décision D10 du plan) :
//
//   npm run fumee -- https://carreau.yvescharvis.fr
//
// Contrôles en lecture seule : aucune écriture, aucun compte. Code de sortie 1 si un contrôle échoue.
// Avec une adresse http (serveur local ou conteneur), la redirection vers https n'est pas contrôlée.
import { pathToFileURL } from "node:url";

/** Tampon des en-têtes de nginx par défaut (proxy_buffer_size) : au-delà, 502. */
const TAILLE_MAX_ENTETES = 4096;

/**
 * Taille des en-têtes d'une réponse : nom, valeur, « : » et fin de ligne.
 * @param {Headers} entetes
 * @returns {number}
 */
export function tailleEntetes(entetes) {
  let total = 0;
  for (const [nom, valeur] of entetes) total += nom.length + valeur.length + 4;
  return total;
}

/**
 * Contrôles d'une instance (décision D10). `requeter` remplace fetch dans les tests.
 * @param {string} base URL de l'instance
 * @param {typeof fetch} [requeter]
 * @returns {Promise<{ nom: string; ok: boolean; detail: string }[]>}
 */
export async function verifierInstance(base, requeter = fetch) {
  const racine = base.replace(/\/+$/, "");
  /** @type {{ nom: string; ok: boolean; detail: string }[]} */
  const resultats = [];
  /** @param {string} nom @param {() => Promise<string>} verifier */
  const controler = async (nom, verifier) => {
    try {
      resultats.push({ nom, ok: true, detail: await verifier() });
    } catch (erreur) {
      resultats.push({ nom, ok: false, detail: erreur instanceof Error ? erreur.message : String(erreur) });
    }
  };
  /** @param {unknown} condition @param {string} message */
  const exiger = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  /** @param {string} chemin @param {RequestInit} [options] */
  const obtenir = (chemin, options = {}) =>
    requeter(`${racine}${chemin}`, { redirect: "manual", ...options });

  await controler("santé", async () => {
    const reponse = await obtenir("/api/sante");
    exiger(reponse.status === 200, `statut ${reponse.status}`);
    exiger((await reponse.json())?.ok === true, "réponse sans « ok: true »");
    return "200";
  });

  await controler("en-têtes de l'accueil", async () => {
    const reponse = await obtenir("/");
    exiger(reponse.status === 200, `statut ${reponse.status}`);
    const hsts = reponse.headers.get("strict-transport-security") ?? "";
    const nombreHsts = (hsts.match(/max-age=/gi) ?? []).length;
    exiger(nombreHsts === 1, `HSTS : ${nombreHsts === 0 ? "absent" : "en double"}`);
    exiger(/'nonce-[^']+'/.test(reponse.headers.get("content-security-policy") ?? ""), "CSP sans nonce");
    exiger(
      (reponse.headers.get("permissions-policy") ?? "").includes("camera=()"),
      "caméra permise sur l'accueil",
    );
    const taille = tailleEntetes(reponse.headers);
    exiger(taille <= TAILLE_MAX_ENTETES, `en-têtes de ${taille} octets (4 096 au plus)`);
    return `HSTS unique, CSP à nonce, ${taille} octets d'en-têtes`;
  });

  if (racine.startsWith("https://")) {
    await controler("redirection vers https", async () => {
      const reponse = await requeter(`${racine.replace(/^https:/, "http:")}/`, { redirect: "manual" });
      const cible = reponse.headers.get("location") ?? "";
      exiger(reponse.status === 301, `statut ${reponse.status}`);
      exiger(cible.startsWith("https://"), `redirection vers ${cible || "rien"}`);
      return "301 vers https";
    });
  }

  await controler("manifeste", async () => {
    const reponse = await obtenir("/manifest.webmanifest");
    const type = reponse.headers.get("content-type") ?? "";
    exiger(reponse.status === 200, `statut ${reponse.status}`);
    exiger(type.includes("application/manifest+json"), `type ${type || "absent"}`);
    return "application/manifest+json";
  });

  await controler("service worker", async () => {
    const reponse = await obtenir("/sw.js");
    const cache = reponse.headers.get("cache-control") ?? "";
    exiger(reponse.status === 200, `statut ${reponse.status}`);
    exiger(cache === "no-cache, no-store, must-revalidate", `Cache-Control : ${cache || "absent"}`);
    return "jamais mis en cache";
  });

  await controler("caméra sur /rejoindre", async () => {
    const reponse = await obtenir("/rejoindre");
    const politique = reponse.headers.get("permissions-policy") ?? "";
    exiger(reponse.status === 200, `statut ${reponse.status}`);
    exiger(politique.includes("camera=(self)"), `Permissions-Policy : ${politique || "absente"}`);
    return "camera=(self)";
  });

  for (const [nom, chemin] of [
    ["serveur MCP sans jeton", "/api/mcp"],
    ["purges sans secret", "/api/cron/purges"],
  ]) {
    await controler(nom, async () => {
      const reponse = await obtenir(chemin, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      exiger(reponse.status === 401, `statut ${reponse.status}`);
      return "401";
    });
  }
  return resultats;
}

async function main() {
  const base = process.argv[2];
  if (!base || !/^https?:\/\/[^/]/.test(base)) {
    console.error("Usage : npm run fumee -- https://carreau.exemple.fr");
    process.exitCode = 1;
    return;
  }
  const resultats = await verifierInstance(base);
  for (const { nom, ok, detail } of resultats) console.log(`${ok ? "OK    " : "ÉCHEC "} ${nom} : ${detail}`);
  process.exitCode = resultats.every((resultat) => resultat.ok) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
