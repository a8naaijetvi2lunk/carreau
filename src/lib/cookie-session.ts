/**
 * Nom et attribut `Secure` d'un cookie (décision D1 du plan du lot 1, étendue aux cookies des
 * téléphones au lot 4) : le préfixe `__Host-` et `Secure` suivent le protocole de l'URL publique
 * (`APP_URL`), jamais `NODE_ENV`. En local et en bout en bout (HTTP), un cookie `Secure` serait
 * refusé par WebKit ; en production (HTTPS), il est exigé.
 */
export type ConfigCookie = { nom: string; securise: boolean };

/** Ancien nom, gardé pour les appelants du lot 1. */
export type ConfigCookieSession = ConfigCookie;

export function configCookie(appUrl: string, base: string): ConfigCookie {
  const securise = new URL(appUrl).protocol === "https:";
  return { nom: securise ? `__Host-${base}` : base, securise };
}

export function configCookieSession(appUrl: string): ConfigCookieSession {
  return configCookie(appUrl, "carreau_session");
}
