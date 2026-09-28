/** Outils partagés par le globalSetup et les bases isolées (serveur PostgreSQL de test, port 50171). */
import { Client } from "pg";

/** Base modèle, migrée une fois, copiée pour chaque fichier de test. */
export const BASE_MODELE = "carreau_modele";

/** Clé du verrou consultatif qui sérialise création et reconstruction de bases. */
export const CLE_VERROU = 727_170_171;

/** URL de la base de maintenance (DATABASE_URL_TEST). */
export function urlMaintenance(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error(
      "DATABASE_URL_TEST manquante : les tests d'intégration ont besoin de la base 50171 (npm run db:up), voir .env.example.",
    );
  }
  return url;
}

/** Même serveur, autre base. */
export function urlBase(nomBase: string): string {
  const url = new URL(urlMaintenance());
  url.pathname = `/${nomBase}`;
  return url.toString();
}

/** Exécute `fn` sur une connexion de maintenance, sous le verrou consultatif. */
export async function sousVerrou<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  // Le verrou consultatif est lié à la session : un Client unique, pas un Pool.
  const client = new Client({ connectionString: urlMaintenance() });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [CLE_VERROU]);
    try {
      return await fn(client);
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [CLE_VERROU]);
    }
  } finally {
    await client.end();
  }
}
