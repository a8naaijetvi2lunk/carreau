/**
 * Base PostgreSQL isolée par fichier de test d'intégration, branchée automatiquement par
 * src/test/setup-integration.ts : un test ne peut pas écrire par oubli dans la base de dev.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll } from "vitest";
import { fermerDbPourLesTests } from "@/db";
import { reinitialiserEnvPourLesTests } from "@/lib/env";
import { BASE_MODELE, sousVerrou, urlBase } from "./bases";

let dejaBranchee = false;

export function utiliserBaseIsolee(): void {
  if (dejaBranchee) return;
  dejaBranchee = true;
  // Minuscules, 42 caractères (limite PostgreSQL : 63).
  const nomBase = `carreau_t_${randomUUID().replaceAll("-", "")}`;
  const urlPrecedente = process.env.DATABASE_URL;

  beforeAll(async () => {
    await sousVerrou(async (client) => {
      await client.query(`CREATE DATABASE ${nomBase} TEMPLATE ${BASE_MODELE}`);
    });
    process.env.DATABASE_URL = urlBase(nomBase);
    reinitialiserEnvPourLesTests();
    await fermerDbPourLesTests();
  });

  afterAll(async () => {
    await fermerDbPourLesTests();
    process.env.DATABASE_URL = urlPrecedente;
    reinitialiserEnvPourLesTests();
    await sousVerrou(async (client) => {
      await client.query(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
    });
  });
}
