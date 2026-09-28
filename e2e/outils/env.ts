/**
 * Réglages des tests de bout en bout : port du serveur de test, base dédiée `carreau_e2e`
 * (serveur PostgreSQL de test, port 50171), variables passées au serveur.
 */
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";

// Les variables déjà posées (CI) gardent la priorité sur le fichier .env.
if (existsSync(".env")) {
  for (const [cle, valeur] of Object.entries(parseEnv(readFileSync(".env", "utf8")))) {
    process.env[cle] ??= valeur;
  }
}

export const PORT_E2E = 50172;

/** `localhost` et non 127.0.0.1 : un cookie `__Host-` (Secure) n'est accepté en HTTP que sur localhost. */
export const URL_E2E = `http://localhost:${PORT_E2E}`;

export const BASE_E2E = "carreau_e2e";

export function urlMaintenance(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error(
      "DATABASE_URL_TEST manquante : les tests de bout en bout ont besoin de la base 50171 (npm run db:up).",
    );
  }
  return url;
}

export function urlBaseE2e(): string {
  const url = new URL(urlMaintenance());
  url.pathname = `/${BASE_E2E}`;
  return url.toString();
}

/**
 * Variables imposées au serveur de test. Les autres variables de .env sont héritées (Playwright
 * fusionne process.env), dont NEXT_SERVER_ACTIONS_ENCRYPTION_KEY, qui doit rester celle du build.
 * Un secret réel du .env de développement n'a rien à faire ici : CRON_SECRET est vidé.
 */
export function envServeur(): Record<string, string> {
  return {
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    // Git Bash pose HOSTNAME = nom du poste : le serveur autonome s'y lierait.
    HOSTNAME: "localhost",
    PORT: String(PORT_E2E),
    DATABASE_URL: urlBaseE2e(),
    E2E_URL_MAINTENANCE: urlMaintenance(),
    APP_URL: URL_E2E,
    IMAGES_DIR: path.join(os.tmpdir(), "carreau-e2e-images"),
    // Clé de test (32 octets à 7), sans valeur réelle.
    CHIFFREMENT_CLE: Buffer.alloc(32, 7).toString("base64"),
    CRON_SECRET: "",
  };
}
