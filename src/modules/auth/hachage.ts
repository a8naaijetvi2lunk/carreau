import "server-only";
import { randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

/**
 * Paramètres OWASP d'argon2id : 19 Mio, 2 itérations, 1 fil. argon2id est l'algorithme par
 * défaut de @node-rs/argon2 (son enum `Algorithm` est un `const enum`, inutilisable avec
 * `isolatedModules`) : un test vérifie le préfixe du hachage.
 */
export const OPTIONS_ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export async function hacherMotDePasse(motDePasse: string): Promise<string> {
  return hash(motDePasse, OPTIONS_ARGON2);
}

/** Vrai si le mot de passe correspond ; faux, sans exception, pour un hachage illisible. */
export async function verifierMotDePasse(hachage: string, motDePasse: string): Promise<boolean> {
  try {
    return await verify(hachage, motDePasse);
  } catch {
    return false;
  }
}

let hachageFactice: Promise<string> | undefined;

/**
 * Pour une adresse sans compte : consomme le temps d'une vraie vérification, pour que la
 * durée de la réponse ne révèle pas l'existence du compte. Renvoie toujours faux.
 */
export async function verifierMotDePasseFactice(motDePasse: string): Promise<false> {
  hachageFactice ??= hash(randomBytes(32).toString("base64url"), OPTIONS_ARGON2).catch((erreur: unknown) => {
    // Un échec ne reste pas en cache : l'appel suivant recalcule le hachage.
    hachageFactice = undefined;
    throw erreur;
  });
  await verifierMotDePasse(await hachageFactice, motDePasse);
  return false;
}
