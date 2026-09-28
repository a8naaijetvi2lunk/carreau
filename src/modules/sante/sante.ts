import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Vrai si la base répond. Le détail d'une panne est journalisé côté serveur, jamais renvoyé. */
export async function verifierBase(): Promise<boolean> {
  try {
    await db().execute(sql`SELECT 1`);
    return true;
  } catch (erreur) {
    console.error("[sante] base indisponible :", erreur instanceof Error ? erreur.message : String(erreur));
    return false;
  }
}
