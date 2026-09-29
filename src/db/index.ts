import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import { journaliserErreurInattendue } from "@/lib/journal-erreur";
import * as schema from "./schema";

let poolInstance: Pool | undefined;
let dbInstance: ReturnType<typeof creerDb> | undefined;

function creerDb(pool: Pool) {
  return drizzle(pool, { schema, casing: "snake_case" });
}

/**
 * Un client inactif coupé par PostgreSQL (redémarrage, arrêt administratif, réseau) émet « error »
 * par le pool : sans écouteur, Node en ferait une exception non interceptée et arrêterait le
 * serveur. Le pool a déjà retiré ce client ; la requête suivante en ouvre un nouveau.
 */
function creerPool(): Pool {
  const pool = new Pool({ connectionString: env().DATABASE_URL });
  pool.on("error", (erreur) => journaliserErreurInattendue("db", "connexion-inactive", erreur));
  return pool;
}

/**
 * Pool et client Drizzle créés au premier appel, à partir de `env().DATABASE_URL`.
 * Jamais au niveau module : `env()` lèverait pendant `next build`.
 */
export function db() {
  poolInstance ??= creerPool();
  dbInstance ??= creerDb(poolInstance);
  return dbInstance;
}

export type Db = ReturnType<typeof db>;

/** Transaction Drizzle (argument du rappel de `db().transaction`). */
export type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Client ou transaction : les fonctions qui écrivent acceptent les deux. */
export type Executeur = Db | Transaction;

/**
 * Ferme le pool et oublie le client. Réservé aux tests d'intégration, qui changent de base.
 * `pool.end()` se résout dès que les clients sont retirés du pool, avant la fermeture de leurs
 * connexions : on attend l'événement « remove » de chacun (émis une fois la connexion close),
 * sinon la base supprimée juste après couperait une connexion encore ouverte (erreur 57P01).
 */
export async function fermerDbPourLesTests(): Promise<void> {
  const pool = poolInstance;
  poolInstance = undefined;
  dbInstance = undefined;
  if (!pool) return;
  let restantes = pool.totalCount;
  const connexionsFermees = new Promise<void>((resoudre) => {
    if (restantes === 0) resoudre();
    pool.on("remove", () => {
      restantes -= 1;
      if (restantes === 0) resoudre();
    });
  });
  await pool.end();
  await connexionsFermees;
}
