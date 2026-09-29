/**
 * Cookie de session (décision D1 du plan du lot 1). Le préfixe `__Host-` et l'attribut `Secure`
 * suivent le protocole de l'URL publique (`APP_URL`), jamais `NODE_ENV` : en local et en bout en
 * bout (HTTP), un cookie `Secure` serait refusé par WebKit ; en production (HTTPS), il est exigé.
 */
export type ConfigCookieSession = { nom: string; securise: boolean };

export function configCookieSession(appUrl: string): ConfigCookieSession {
  const securise = new URL(appUrl).protocol === "https:";
  return { nom: securise ? "__Host-carreau_session" : "carreau_session", securise };
}
