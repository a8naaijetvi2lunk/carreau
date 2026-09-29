/**
 * Vrai si l'erreur est une violation d'unicité PostgreSQL (SQLSTATE 23505), cherchée dans
 * l'erreur puis dans ses causes (Drizzle enveloppe l'erreur `pg`), éventuellement sur la
 * contrainte nommée. Sert à convertir une course perdue en message clair.
 */
export function estViolationUnicite(erreur: unknown, contrainte?: string): boolean {
  let courant: unknown = erreur;
  for (let profondeur = 0; profondeur < 3; profondeur++) {
    if (typeof courant !== "object" || courant === null) return false;
    const { code, constraint, cause } = courant as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (code === "23505") return contrainte === undefined || constraint === contrainte;
    courant = cause;
  }
  return false;
}
