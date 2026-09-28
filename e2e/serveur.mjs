// Serveur des tests de bout en bout, lancé par le `webServer` de playwright.config.ts
// (qui fournit toutes les variables, voir e2e/outils/env.ts) :
//   1. recrée la base carreau_e2e et y applique les migrations ;
//   2. vide le dossier des images ;
//   3. démarre le build autonome (.next/standalone), celui de l'image Docker.
// Le build n'est pas lancé ici : `npm run build` d'abord.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

const AUTONOME = path.resolve(".next", "standalone");

if (!existsSync(path.join(AUTONOME, "server.js"))) {
  console.error("[e2e] Build autonome absent : lancer `npm run build` avant `npm run test:e2e`.");
  process.exit(1);
}

const nomBase = new URL(process.env.DATABASE_URL).pathname.slice(1);
// Un nom de base ne se passe pas en paramètre SQL : on n'accepte qu'un identifiant simple.
if (!/^[a-z_][a-z0-9_]*$/.test(nomBase)) {
  console.error(`[e2e] Nom de base inattendu : ${nomBase}`);
  process.exit(1);
}

const maintenance = new pg.Client({ connectionString: process.env.E2E_URL_MAINTENANCE });
await maintenance.connect();
try {
  await maintenance.query(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
  await maintenance.query(`CREATE DATABASE ${nomBase}`);
} finally {
  await maintenance.end();
}
execFileSync(process.execPath, ["scripts/migrer.mjs"], { stdio: "inherit", env: process.env });

rmSync(process.env.IMAGES_DIR, { recursive: true, force: true });
mkdirSync(process.env.IMAGES_DIR, { recursive: true });

// Comme le Dockerfile : le build autonome ne contient ni .next/static ni public.
cpSync(path.resolve(".next", "static"), path.join(AUTONOME, ".next", "static"), { recursive: true });
if (existsSync("public")) cpSync("public", path.join(AUTONOME, "public"), { recursive: true });

await import(pathToFileURL(path.join(AUTONOME, "server.js")).href);
