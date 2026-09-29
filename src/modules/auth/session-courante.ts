/**
 * Session de la requête en cours (pages, Server Actions). Seul fichier des modules qui dépend
 * de `next/headers` ; le cookie ne s'écrit que dans une Server Action.
 */
import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { configCookieSession } from "@/lib/cookie-session";
import { env } from "@/lib/env";
import { erreurs } from "@/lib/erreurs";
import { lireSessionEnAttente, validerJetonSession, type SessionEnAttente } from "./sessions";

function cookieSession() {
  return configCookieSession(env().APP_URL);
}

/** Jeton du cookie de session de la requête, ou null. */
export async function jetonSessionCourant(): Promise<string | null> {
  return (await cookies()).get(cookieSession().nom)?.value ?? null;
}

/** Acteur de la requête (session complète) ou null ; une seule lecture en base par requête. */
export const acteurCourant = cache(async (): Promise<ActeurUtilisateur | null> => {
  const jeton = await jetonSessionCourant();
  return jeton ? validerJetonSession(jeton) : null;
});

/** Acteur de la requête ; NON_CONNECTE sinon (une page est alors renvoyée vers /connexion). */
export async function exigerActeur(): Promise<ActeurUtilisateur> {
  const acteur = await acteurCourant();
  if (!acteur) throw erreurs.nonConnecte();
  return acteur;
}

/** Session de la requête en attente de double authentification, ou null. */
export async function sessionEnAttenteCourante(): Promise<SessionEnAttente | null> {
  const jeton = await jetonSessionCourant();
  return jeton ? lireSessionEnAttente(jeton) : null;
}

/**
 * Pose le cookie de session (Server Action uniquement). `expireLe` : fin d'une session
 * « Rester connecté » ; null : cookie de navigateur, effacé à la fermeture.
 */
export async function poserCookieSession(jeton: string, expireLe: Date | null): Promise<void> {
  const { nom, securise } = cookieSession();
  (await cookies()).set(nom, jeton, {
    httpOnly: true,
    secure: securise,
    sameSite: "lax",
    path: "/",
    ...(expireLe ? { expires: expireLe } : {}),
  });
}

/** Efface le cookie de session (Server Action uniquement). */
export async function effacerCookieSession(): Promise<void> {
  const { nom, securise } = cookieSession();
  (await cookies()).set(nom, "", { httpOnly: true, secure: securise, sameSite: "lax", path: "/", maxAge: 0 });
}
