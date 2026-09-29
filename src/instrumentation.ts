import { env } from "@/lib/env";

/**
 * Paquets de `serverExternalPackages` (next.config.ts) : copiés par le traçage de Next dans
 * `.next/standalone/node_modules`. S'il en oublie un, l'application démarrerait et casserait
 * au premier usage : on préfère un démarrage refusé, visible aussitôt par le healthcheck.
 */
const PAQUETS_CRITIQUES = [
  "pg",
  "@node-rs/argon2",
  "read-excel-file/node",
  "sharp",
  "shiki/core",
  "shiki/engine/javascript",
  "@shikijs/langs/python",
] as const;

/** Appelée une fois au démarrage du serveur Node.js : valide l'environnement et les paquets externes. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  env();

  const manquants: string[] = [];
  for (const paquet of PAQUETS_CRITIQUES) {
    try {
      await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ paquet);
    } catch (erreur) {
      manquants.push(`${paquet} (${erreur instanceof Error ? erreur.message : String(erreur)})`);
    }
  }
  if (manquants.length > 0) {
    throw new Error(
      `Paquets serveur introuvables à l'exécution :\n- ${manquants.join("\n- ")}\n` +
        "Vérifier `serverExternalPackages` dans next.config.ts et .next/standalone/node_modules.",
    );
  }
}
