/** Données de test des comptes, pour les tests d'intégration (base isolée). */
import { db } from "@/db";
import { utilisateur } from "@/db/schema";
import type { ActeurUtilisateur, Role } from "@/lib/acteur";
import { maintenant } from "@/lib/horloge";
import {
  chiffrerSecretTotp,
  genererCodeHotp,
  hacherMotDePasse,
  lireSessionEnAttente,
  ouvrirSessionEnAttente,
  pasTotp,
  validerSession,
} from "@/modules/auth";

export const MOT_DE_PASSE_TEST = "correct cheval pile agrafe";

/** Secret TOTP fixe des comptes de test : octets 1 à 20. */
export const SECRET_TOTP_TEST = new Uint8Array(20).map((_, i) => i + 1);

let hachageMemoise: Promise<string> | undefined;

/** Hachage argon2 de MOT_DE_PASSE_TEST, calculé une fois par fichier de test. */
function hachageTest(): Promise<string> {
  hachageMemoise ??= hacherMotDePasse(MOT_DE_PASSE_TEST);
  return hachageMemoise;
}

/** Valeur non nulle, ou erreur explicite (évite les assertions non nulles). */
export function exiger<T>(valeur: T | null | undefined, quoi = "valeur"): T {
  if (valeur === null || valeur === undefined) throw new Error(`${quoi} absente`);
  return valeur;
}

export type OptionsUtilisateur = {
  email?: string;
  nom?: string;
  prenom?: string;
  role?: Role;
  actif?: boolean;
  /** Faux : TOTP à enrôler. Vrai par défaut (secret SECRET_TOTP_TEST). */
  totp?: boolean;
};

let compteur = 0;

export async function creerUtilisateur(options: OptionsUtilisateur = {}) {
  compteur += 1;
  const [cree] = await db()
    .insert(utilisateur)
    .values({
      email: options.email ?? `compte${compteur}@exemple.fr`,
      nom: options.nom ?? `Nom${compteur}`,
      prenom: options.prenom ?? "Prénom",
      role: options.role ?? "enseignant",
      motDePasseHash: await hachageTest(),
      totpSecretChiffre: options.totp === false ? null : chiffrerSecretTotp(SECRET_TOTP_TEST),
      actif: options.actif ?? true,
      creeLe: maintenant(),
    })
    .returning();
  return exiger(cree, "utilisateur");
}

export function acteurDe(
  u: typeof utilisateur.$inferSelect,
  sessionId = "00000000-0000-4000-8000-000000000000",
): ActeurUtilisateur {
  return {
    type: "utilisateur",
    id: u.id,
    sessionId,
    email: u.email,
    nom: u.nom,
    prenom: u.prenom,
    role: u.role,
  };
}

/** Code TOTP du secret de test pour le pas de `instant`, décalé de `decalage` pas. */
export function codeTotpTest(instant: Date, decalage = 0, secret: Uint8Array = SECRET_TOTP_TEST): string {
  return genererCodeHotp(secret, pasTotp(instant) + decalage);
}

/** Session complète (double authentification validée) pour `utilisateurId`. */
export async function ouvrirSessionComplete(
  utilisateurId: string,
  resterConnecte = false,
): Promise<{ jeton: string; sessionId: string }> {
  const attente = await ouvrirSessionEnAttente(utilisateurId, resterConnecte);
  const session = exiger(await lireSessionEnAttente(attente.jeton), "session en attente");
  const ouverte = exiger(await validerSession(session.sessionId, resterConnecte), "session validée");
  return { jeton: ouverte.jeton, sessionId: session.sessionId };
}
