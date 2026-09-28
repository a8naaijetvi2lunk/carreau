import "server-only";
import { db, type Executeur } from "@/db";
import { journal } from "@/db/schema";
import { maintenant } from "@/lib/horloge";

export type TypeActeur = "utilisateur" | "participation" | "jeton" | "systeme" | "anonyme";

export type ActeurJournal = { type: TypeActeur; id?: string };

export type EntreeJournal = {
  acteur: ActeurJournal;
  /** Format `domaine.verbe` (ex. « auth.connexion »). */
  action: string;
  cible?: string;
  /** Jamais de secret, de mot de passe, de jeton ni de contenu de réponse. */
  details?: Record<string, unknown>;
};

const FORMAT_ACTION = /^[a-z][a-z_]*\.[a-z][a-z_]*$/;

/**
 * Écrit une entrée du journal d'audit (spec §4.1). `executeur` permet d'écrire dans la
 * transaction de l'appelant : l'entrée disparaît alors avec une annulation.
 */
export async function journaliser(entree: EntreeJournal, executeur: Executeur = db()): Promise<void> {
  if (!FORMAT_ACTION.test(entree.action)) {
    throw new Error(`Action de journal invalide : « ${entree.action} » (format domaine.verbe attendu).`);
  }
  await executeur.insert(journal).values({
    acteurType: entree.acteur.type,
    acteurId: entree.acteur.id ?? null,
    action: entree.action,
    cible: entree.cible ?? null,
    details: entree.details ?? {},
    creeLe: maintenant(),
  });
}
