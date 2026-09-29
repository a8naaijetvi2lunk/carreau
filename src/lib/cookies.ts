/**
 * Cookies des routes d'API étudiantes (décision D7 du plan du lot 4) : lus dans l'en-tête `Cookie`
 * et posés par un en-tête `Set-Cookie` de la réponse, sans `next/headers`. Une route se teste ainsi
 * en l'appelant avec une `Request`.
 */

/** Valeur du cookie `nom`, ou null (absent ou vide). */
export function lireCookie(entetes: { get(nom: string): string | null }, nom: string): string | null {
  const brut = entetes.get("cookie");
  if (!brut) return null;
  for (const morceau of brut.split(";")) {
    const egal = morceau.indexOf("=");
    if (egal < 0 || morceau.slice(0, egal).trim() !== nom) continue;
    const valeur = morceau.slice(egal + 1).trim();
    return valeur === "" ? null : valeur;
  }
  return null;
}

export type OptionsCookie = { securise: boolean; dureeSecondes: number };

/** Caractères d'un jeton ou d'un ticket : aucun « ; » ni espace qui ajouterait un attribut. */
const VALEUR_SURE = /^[A-Za-z0-9._~-]*$/;

/** En-tête `Set-Cookie` : `Path=/`, `HttpOnly`, `SameSite=Lax`, `Max-Age`, et `Secure` en HTTPS. */
export function enteteCookie(nom: string, valeur: string, options: OptionsCookie): string {
  if (!VALEUR_SURE.test(valeur)) throw new Error("Valeur de cookie non sûre.");
  const attributs = [
    `${nom}=${valeur}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${options.dureeSecondes}`,
  ];
  if (options.securise) attributs.push("Secure");
  return attributs.join("; ");
}
