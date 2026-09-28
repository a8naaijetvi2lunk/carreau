/**
 * Journalisation d'une erreur inattendue sans fuite de données personnelles.
 *
 * Une erreur SQL remontée par Drizzle a pour message `Failed query: <sql>\nparams: <paramètres>` :
 * la journaliser telle quelle (ou sa pile) enverrait dans la sortie du conteneur les réponses
 * des étudiants, leurs noms, voire des empreintes de secrets, hors de toute politique de purge.
 * Le `detail` d'une erreur PostgreSQL est tout aussi bavard. On journalise donc un résumé
 * construit à la main : nom, message assaini, SQLSTATE, contrainte, table, colonne et requête
 * SANS ses paramètres.
 */

/** Résumé sûr d'une erreur, destiné aux journaux du conteneur. */
export type ResumeErreur = {
  nom: string;
  message: string;
  /** Code trouvé dans l'erreur ou dans sa chaîne de causes : SQLSTATE PostgreSQL le plus souvent, parfois un code système (ECONNREFUSED) ou métier. */
  code?: string;
  contrainte?: string;
  table?: string;
  colonne?: string;
  /** Requête SQL, sans ses paramètres (erreur de requête Drizzle). */
  requete?: string;
  /** Pile d'appel : jamais pour une erreur de requête, son message porte les paramètres. */
  pile?: string;
};

/** Message de remplacement : le message d'origine contient les paramètres. */
export const MESSAGE_REQUETE_MASQUE = "Échec d'une requête SQL (paramètres masqués)";

function champTexte(source: unknown, cle: string): string | undefined {
  if (typeof source !== "object" || source === null) return undefined;
  const valeur = (source as Record<string, unknown>)[cle];
  return typeof valeur === "string" && valeur.length > 0 ? valeur : undefined;
}

/**
 * Erreur de requête Drizzle, reconnue à sa forme (`query` textuelle + `params`) plutôt
 * qu'avec `instanceof` : la classe n'est pas exportée par la racine du paquet.
 */
export function estErreurRequete(erreur: unknown): boolean {
  return (
    typeof erreur === "object" &&
    erreur !== null &&
    typeof (erreur as { query?: unknown }).query === "string" &&
    "params" in erreur
  );
}

/**
 * SQLSTATE et repères de schéma, cherchés dans l'erreur puis dans ses causes (Drizzle
 * enveloppe l'erreur `pg`). Jamais `detail` ni `where` : ils citent les valeurs en cause.
 */
function reperesPostgres(erreur: unknown): Pick<ResumeErreur, "code" | "contrainte" | "table" | "colonne"> {
  let courant: unknown = erreur;
  for (let profondeur = 0; profondeur < 3 && typeof courant === "object" && courant !== null; profondeur++) {
    const code = champTexte(courant, "code");
    if (code !== undefined) {
      const contrainte = champTexte(courant, "constraint");
      const table = champTexte(courant, "table");
      const colonne = champTexte(courant, "column");
      return {
        code,
        ...(contrainte !== undefined ? { contrainte } : {}),
        ...(table !== undefined ? { table } : {}),
        ...(colonne !== undefined ? { colonne } : {}),
      };
    }
    courant = (courant as { cause?: unknown }).cause;
  }
  return {};
}

/** Résumé journalisable d'une erreur inattendue, sans donnée personnelle. */
export function resumerErreur(erreur: unknown): ResumeErreur {
  if (typeof erreur !== "object" || erreur === null) {
    return { nom: typeof erreur, message: "(valeur levée non structurée)" };
  }
  const reperes = reperesPostgres(erreur);
  const nomBrut = champTexte(erreur, "name");

  if (estErreurRequete(erreur)) {
    const requete = champTexte(erreur, "query");
    return {
      nom: nomBrut !== undefined && nomBrut !== "Error" ? nomBrut : "DrizzleQueryError",
      message: MESSAGE_REQUETE_MASQUE,
      ...reperes,
      ...(requete !== undefined ? { requete } : {}),
    };
  }

  const pile = champTexte(erreur, "stack");
  return {
    nom: nomBrut ?? "Error",
    message: champTexte(erreur, "message") ?? "(sans message)",
    ...reperes,
    ...(pile !== undefined ? { pile } : {}),
  };
}

/**
 * Journalise une erreur inattendue : `[<origine>] Erreur inattendue (réf. X)` suivi du seul
 * résumé assaini. À utiliser partout où une erreur non prévue est attrapée.
 */
export function journaliserErreurInattendue(origine: string, reference: string, erreur: unknown): void {
  console.error(`[${origine}] Erreur inattendue (réf. ${reference})`, resumerErreur(erreur));
}
