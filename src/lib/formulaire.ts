/** Lecture des formulaires envoyés aux Server Actions. Les services valident ensuite les valeurs. */

/** Valeur texte d'un champ ; chaîne vide si le champ est absent ou si c'est un fichier. */
export function lireChamp(formulaire: FormData, nom: string): string {
  const valeur = formulaire.get(nom);
  return typeof valeur === "string" ? valeur : "";
}

/** Case à cocher : vraie si elle est présente dans le formulaire. */
export function lireCase(formulaire: FormData, nom: string): boolean {
  return formulaire.get(nom) !== null;
}

/** Valeurs texte d'un champ répété (cases à cocher de même nom) ; les fichiers sont ignorés. */
export function lireListe(formulaire: FormData, nom: string): string[] {
  return formulaire.getAll(nom).filter((valeur): valeur is string => typeof valeur === "string");
}

/**
 * Messages d'erreur par champ, à partir des `details` d'une erreur VALIDATION
 * (`[{ chemin: "email", message }]`, voir `erreurDepuisZod`). Premier message de chaque champ.
 */
export function erreursParChamp(details: unknown): Record<string, string> {
  if (!Array.isArray(details)) return {};
  const resultat: Record<string, string> = {};
  for (const detail of details) {
    if (typeof detail !== "object" || detail === null) continue;
    const { chemin, message } = detail as { chemin?: unknown; message?: unknown };
    if (typeof chemin !== "string" || typeof message !== "string") continue;
    const champ = chemin.split(".")[0] ?? "";
    if (champ !== "" && !(champ in resultat)) resultat[champ] = message;
  }
  return resultat;
}

/** Fichier envoyé ; null si le champ est absent, n'est pas un fichier ou si aucun fichier n'a été choisi. */
export function lireFichier(formulaire: FormData, nom: string): File | null {
  const valeur = formulaire.get(nom);
  return valeur instanceof File && valeur.size > 0 ? valeur : null;
}

/** Champ texte contenant du JSON ; `undefined` s'il est absent ou invalide (le service valide la structure). */
export function lireChampJson(formulaire: FormData, nom: string): unknown {
  const valeur = formulaire.get(nom);
  if (typeof valeur !== "string") return undefined;
  try {
    return JSON.parse(valeur) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Nombre saisi dans un champ : null si le champ est vide ; `NaN` si la saisie n'est pas un nombre
 * (le schéma du service la refuse avec son message).
 */
export function lireNombre(formulaire: FormData, nom: string): number | null {
  const texte = lireChamp(formulaire, nom).trim().replace(",", ".");
  if (texte === "") return null;
  return /^[+-]?\d+(\.\d+)?$/.test(texte) ? Number(texte) : Number.NaN;
}
