import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

let poolInstance: Pool | undefined;
let dbInstance: ReturnType<typeof creerDb> | undefined;

function creerDb(pool: Pool) {
  return drizzle(pool, { schema, casing: "snake_case" });
}

/**
 * Pool et client Drizzle créés au premier appel, à partir de `env().DATABASE_URL`.
 * Jamais au niveau module : `env()` lèverait pendant `next build`.
 */
export function db() {
  poolInstance ??= new Pool({ connectionString: env().DATABASE_URL });
  dbInstance ??= creerDb(poolInstance);
  return dbInstance;
}

export type Db = ReturnType<typeof db>;

/** Transaction Drizzle (argument du rappel de `db().transaction`). */
export type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Client ou transaction : les fonctions qui écrivent acceptent les deux. */
export type Executeur = Db | Transaction;

/** Ferme le pool et oublie le client. Réservé aux tests d'intégration, qui changent de base. */
export async function fermerDbPourLesTests(): Promise<void> {
  const pool = poolInstance;
  poolInstance = undefined;
  dbInstance = undefined;
  if (pool) await pool.end();
}
