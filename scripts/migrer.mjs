// Applique les migrations Drizzle versionnées (dossier drizzle/). JavaScript pur : ce
// script tourne en développement (npm run db:migrate) et au démarrage du conteneur
// (docker-entrypoint.sh), avant `node server.js`. Jamais pendant le build.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[migrer] DATABASE_URL manquante, migrations annulées.");
    process.exitCode = 1;
    return;
  }

  console.log(`[migrer] Démarrage (${new Date().toISOString()})`);
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    console.log(`[migrer] Terminé (${new Date().toISOString()})`);
  } catch (erreur) {
    console.error("[migrer] Échec des migrations :", erreur instanceof Error ? erreur.message : erreur);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
