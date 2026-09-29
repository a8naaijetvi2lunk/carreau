/**
 * Sessions de connexion (spec §5, décision D2 du plan du lot 1). Jeton de 256 bits remis en
 * cookie ; seule son empreinte SHA-256 est en base. Deux temps :
 * - en attente : ouverte par le mot de passe ou l'activation, 10 min, sans accès aux pages ;
 * - complète : après le code TOTP, jeton changé, 12 h (30 min d'inactivité) ou, avec
 *   « Rester connecté », 30 jours sans limite d'inactivité.
 * Sans dépendance à next/headers : testable en intégration.
 */
import "server-only";
import { and, eq, isNull, lt } from "drizzle-orm";
import { db, type Executeur } from "@/db";
import { sessionConnexion, utilisateur } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { maintenant } from "@/lib/horloge";
import { FORMAT_JETON, genererJeton, sha256Hex } from "@/lib/jetons";

export const DUREE_DOUBLE_AUTH_MS = 10 * 60 * 1000;
export const DUREE_SESSION_MS = 12 * 60 * 60 * 1000;
export const DUREE_SESSION_LONGUE_MS = 30 * 24 * 60 * 60 * 1000;
export const DUREE_INACTIVITE_MS = 30 * 60 * 1000;
/** L'activité n'est écrite qu'une fois par minute : pas d'écriture à chaque page. */
const INTERVALLE_ACTIVITE_MS = 60 * 1000;

/** Session à poser en cookie : le jeton n'est jamais stocké en clair. */
export type SessionOuverte = { jeton: string; expireLe: Date; resterConnecte: boolean };

export type SessionEnAttente = {
  sessionId: string;
  utilisateurId: string;
  email: string;
  resterConnecte: boolean;
  /** Secret TOTP du compte ; null : double authentification à enrôler. */
  totpSecretChiffre: string | null;
  /** Secret tiré pour l'enrôlement en cours, s'il y en a un. */
  totpEnAttenteChiffre: string | null;
};

/** Ouvre une session en attente de double authentification (10 min). */
export async function ouvrirSessionEnAttente(
  utilisateurId: string,
  resterConnecte: boolean,
  executeur: Executeur = db(),
): Promise<SessionOuverte> {
  const jeton = genererJeton();
  const instant = maintenant();
  const expireLe = new Date(instant.getTime() + DUREE_DOUBLE_AUTH_MS);
  await executeur.insert(sessionConnexion).values({
    utilisateurId,
    jetonHash: sha256Hex(jeton),
    creeLe: instant,
    derniereActiviteLe: instant,
    expireLe,
    doubleAuthValidee: false,
    resterConnecte,
  });
  return { jeton, expireLe, resterConnecte };
}

/** Session en attente valide, d'un compte actif ; null sinon (jeton inconnu, expiré, déjà validé). */
export async function lireSessionEnAttente(jeton: string): Promise<SessionEnAttente | null> {
  if (!FORMAT_JETON.test(jeton)) return null;
  const [ligne] = await db()
    .select({
      sessionId: sessionConnexion.id,
      expireLe: sessionConnexion.expireLe,
      resterConnecte: sessionConnexion.resterConnecte,
      totpEnAttenteChiffre: sessionConnexion.totpEnAttenteChiffre,
      utilisateurId: utilisateur.id,
      email: utilisateur.email,
      actif: utilisateur.actif,
      totpSecretChiffre: utilisateur.totpSecretChiffre,
    })
    .from(sessionConnexion)
    .innerJoin(utilisateur, eq(sessionConnexion.utilisateurId, utilisateur.id))
    .where(
      and(eq(sessionConnexion.jetonHash, sha256Hex(jeton)), eq(sessionConnexion.doubleAuthValidee, false)),
    )
    .limit(1);
  if (!ligne || !ligne.actif || ligne.expireLe.getTime() <= maintenant().getTime()) return null;
  return {
    sessionId: ligne.sessionId,
    utilisateurId: ligne.utilisateurId,
    email: ligne.email,
    resterConnecte: ligne.resterConnecte,
    totpSecretChiffre: ligne.totpSecretChiffre,
    totpEnAttenteChiffre: ligne.totpEnAttenteChiffre,
  };
}

/**
 * Enregistre le secret TOTP à enrôler, sauf si la session en porte déjà un (deux affichages
 * simultanés de l'écran ne doivent pas changer le QR code). Renvoie le secret retenu.
 */
export async function enregistrerSecretEnAttente(sessionId: string, secretChiffre: string): Promise<string> {
  const [ecrit] = await db()
    .update(sessionConnexion)
    .set({ totpEnAttenteChiffre: secretChiffre })
    .where(and(eq(sessionConnexion.id, sessionId), isNull(sessionConnexion.totpEnAttenteChiffre)))
    .returning({ secret: sessionConnexion.totpEnAttenteChiffre });
  if (ecrit?.secret) return ecrit.secret;
  const [actuel] = await db()
    .select({ secret: sessionConnexion.totpEnAttenteChiffre })
    .from(sessionConnexion)
    .where(eq(sessionConnexion.id, sessionId))
    .limit(1);
  return actuel?.secret ?? secretChiffre;
}

/**
 * Valide la double authentification : nouveau jeton (rotation), secret d'enrôlement effacé,
 * durée pleine. Null si la session n'est plus en attente (validée entre-temps, supprimée).
 */
export async function validerSession(
  sessionId: string,
  resterConnecte: boolean,
  executeur: Executeur = db(),
): Promise<SessionOuverte | null> {
  const jeton = genererJeton();
  const instant = maintenant();
  const expireLe = new Date(
    instant.getTime() + (resterConnecte ? DUREE_SESSION_LONGUE_MS : DUREE_SESSION_MS),
  );
  const lignes = await executeur
    .update(sessionConnexion)
    .set({
      jetonHash: sha256Hex(jeton),
      doubleAuthValidee: true,
      totpEnAttenteChiffre: null,
      expireLe,
      derniereActiviteLe: instant,
    })
    .where(and(eq(sessionConnexion.id, sessionId), eq(sessionConnexion.doubleAuthValidee, false)))
    .returning({ id: sessionConnexion.id });
  return lignes.length === 1 ? { jeton, expireLe, resterConnecte } : null;
}

/**
 * Acteur d'une session complète, ou null : jeton inconnu, session en attente, expirée ou
 * inactive depuis plus de 30 min (alors supprimée), compte désactivé.
 */
export async function validerJetonSession(jeton: string): Promise<ActeurUtilisateur | null> {
  if (!FORMAT_JETON.test(jeton)) return null;
  const [ligne] = await db()
    .select({
      sessionId: sessionConnexion.id,
      expireLe: sessionConnexion.expireLe,
      derniereActiviteLe: sessionConnexion.derniereActiviteLe,
      resterConnecte: sessionConnexion.resterConnecte,
      doubleAuthValidee: sessionConnexion.doubleAuthValidee,
      utilisateurId: utilisateur.id,
      email: utilisateur.email,
      nom: utilisateur.nom,
      prenom: utilisateur.prenom,
      role: utilisateur.role,
      actif: utilisateur.actif,
    })
    .from(sessionConnexion)
    .innerJoin(utilisateur, eq(sessionConnexion.utilisateurId, utilisateur.id))
    .where(eq(sessionConnexion.jetonHash, sha256Hex(jeton)))
    .limit(1);
  if (!ligne || !ligne.doubleAuthValidee) return null;

  const instant = maintenant();
  const inactive =
    !ligne.resterConnecte && instant.getTime() - ligne.derniereActiviteLe.getTime() > DUREE_INACTIVITE_MS;
  if (ligne.expireLe.getTime() <= instant.getTime() || inactive) {
    await db().delete(sessionConnexion).where(eq(sessionConnexion.id, ligne.sessionId));
    return null;
  }
  if (!ligne.actif) return null;

  await db()
    .update(sessionConnexion)
    .set({ derniereActiviteLe: instant })
    .where(
      and(
        eq(sessionConnexion.id, ligne.sessionId),
        lt(sessionConnexion.derniereActiviteLe, new Date(instant.getTime() - INTERVALLE_ACTIVITE_MS)),
      ),
    );

  return {
    type: "utilisateur",
    id: ligne.utilisateurId,
    sessionId: ligne.sessionId,
    email: ligne.email,
    nom: ligne.nom,
    prenom: ligne.prenom,
    role: ligne.role,
  };
}

export async function supprimerSession(sessionId: string): Promise<void> {
  await db().delete(sessionConnexion).where(eq(sessionConnexion.id, sessionId));
}

/** Supprime une session encore en attente (abandon de la double authentification). */
export async function supprimerSessionEnAttente(jeton: string): Promise<void> {
  if (!FORMAT_JETON.test(jeton)) return;
  await db()
    .delete(sessionConnexion)
    .where(
      and(eq(sessionConnexion.jetonHash, sha256Hex(jeton)), eq(sessionConnexion.doubleAuthValidee, false)),
    );
}

/** Révoque toutes les sessions d'un compte (désactivation, réinitialisation, TOTP réinitialisé). */
export async function supprimerSessionsUtilisateur(
  utilisateurId: string,
  executeur: Executeur = db(),
): Promise<void> {
  await executeur.delete(sessionConnexion).where(eq(sessionConnexion.utilisateurId, utilisateurId));
}
