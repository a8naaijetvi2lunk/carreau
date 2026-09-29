// Serveur des tests de bout en bout, lancé par le `webServer` de playwright.config.ts
// (qui fournit toutes les variables, voir e2e/outils/env.ts) :
//   1. recrée la base carreau_e2e et y applique les migrations ;
//   2. vide le dossier des images ;
//   3. démarre une copie du build autonome (.next/standalone), celui de l'image Docker, placée hors du dépôt.
// Le build n'est pas lancé ici : `npm run build` d'abord.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
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

// Copie du build autonome hors du dépôt : Node y résout les paquets comme dans l'image Docker,
// sans remonter jusqu'au node_modules du projet (un paquet oublié par le traçage ferait alors
// échouer le démarrage ici, et non plus seulement en production). Les copies des lancements
// précédents sont supprimées au passage (le serveur est arrêté sans pouvoir nettoyer derrière lui).
const PREFIXE_COPIE = "carreau-e2e-autonome-";
for (const nom of readdirSync(os.tmpdir())) {
  if (!nom.startsWith(PREFIXE_COPIE)) continue;
  try {
    rmSync(path.join(os.tmpdir(), nom), { recursive: true, force: true });
  } catch {
    // Encore utilisée par un serveur qui n'est pas terminé : elle partira au prochain lancement.
  }
}
const COPIE = mkdtempSync(path.join(os.tmpdir(), PREFIXE_COPIE));
cpSync(AUTONOME, COPIE, { recursive: true });
// Comme le Dockerfile : le build autonome ne contient ni .next/static ni public.
cpSync(path.resolve(".next", "static"), path.join(COPIE, ".next", "static"), { recursive: true });
if (existsSync("public")) cpSync("public", path.join(COPIE, "public"), { recursive: true });

await import(pathToFileURL(path.join(COPIE, "server.js")).href);
