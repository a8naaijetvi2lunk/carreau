/**
 * globalSetup des tests d'intégration : (re)construit la base modèle `carreau_modele` avec
 * toutes les migrations, uniquement si l'empreinte du dossier drizzle/ a changé. Plusieurs
 * lancements simultanés sont sérialisés par un verrou consultatif PostgreSQL.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { loadEnv } from "vite";
import { BASE_MODELE, sousVerrou, urlBase } from "./bases";

const DOSSIER_MIGRATIONS = path.resolve(process.cwd(), "drizzle");

/** SHA-256 des fichiers SQL et du journal des migrations. */
function empreinteMigrations(): string {
  const fichiers = [
    ...readdirSync(DOSSIER_MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .sort(),
    "meta/_journal.json",
  ];
  const h = createHash("sha256");
  for (const f of fichiers) {
    h.update(f);
    h.update(readFileSync(path.join(DOSSIER_MIGRATIONS, f)));
  }
  return h.digest("hex");
}

export default async function setup(): Promise<void> {
  // `test.env` ne s'applique qu'aux workers : charger .env ici aussi.
  for (const [cle, valeur] of Object.entries(loadEnv("", process.cwd(), ""))) {
    process.env[cle] ??= valeur;
  }

  const empreinte = empreinteMigrations();

  await sousVerrou(async (client) => {
    const { rows } = await client.query<{ commentaire: string | null }>(
      "SELECT shobj_description(oid, 'pg_database') AS commentaire FROM pg_database WHERE datname = $1",
      [BASE_MODELE],
    );
    if (rows[0]?.commentaire === empreinte) return;

    console.log("[tests] Reconstruction de la base modèle (migrations modifiées)…");
    await client.query(`DROP DATABASE IF EXISTS ${BASE_MODELE} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${BASE_MODELE}`);
    const pool = new Pool({ connectionString: urlBase(BASE_MODELE) });
    try {
      await migrate(drizzle(pool), { migrationsFolder: DOSSIER_MIGRATIONS });
    } finally {
      // Aucune connexion ne doit rester ouverte sur le modèle (CREATE DATABASE … TEMPLATE).
      await pool.end();
    }
    // Empreinte hexadécimale : aucune injection possible.
    await client.query(`COMMENT ON DATABASE ${BASE_MODELE} IS '${empreinte}'`);
  });
}
