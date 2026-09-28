/** Options de la Content-Security-Policy d'une réponse. */
export type OptionsCsp = {
  /** Nonce aléatoire propre à la requête. */
  nonce: string;
  /** Mode développement : React Fast Refresh exige 'unsafe-eval'. */
  developpement: boolean;
  /** Requête arrivée en HTTPS : on peut alors exiger HTTPS pour les sous-ressources. */
  https: boolean;
};

/**
 * CSP à nonce (guide officiel Next 16). `style-src-attr 'unsafe-inline'` : les attributs
 * `style="…"` rendus côté serveur ne peuvent pas porter de nonce ; les balises <style>
 * et <script> restent sous nonce.
 */
export function construireCsp({ nonce, developpement, https }: OptionsCsp): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developpement ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/**
 * Vrai si la requête est arrivée en HTTPS : protocole transmis par le proxy
 * (dernière valeur de `x-forwarded-proto`) ou protocole de l'URL. Jamais déduit de
 * `NODE_ENV` : un durcissement lié à l'environnement est invisible en local.
 */
export function requeteEnHttps(entetes: { get(nom: string): string | null }, protocole: string): boolean {
  const transmis = entetes.get("x-forwarded-proto")?.split(",").at(-1)?.trim().toLowerCase();
  return transmis === "https" || protocole === "https:";
}
