/**
 * Résultats des outils MCP (spec §10 ; décision D8 du plan du lot 8). Succès : données en JSON indenté.
 * Erreur : `isError` avec `{ code, message, details? }`, les détails de validation écrits « chemin :
 * message » pour que l'assistant corrige sa demande. Toujours du texte brut, jamais interprété.
 */
import type { ErreurService } from "./erreurs";

export type ContenuTexte = { type: "text"; text: string };
export type ResultatOutil = { content: ContenuTexte[]; isError?: boolean };

export function resultatSucces(donnees: unknown): ResultatOutil {
  return { content: [{ type: "text", text: JSON.stringify(donnees, null, 2) }] };
}

/** Lignes « chemin : message » des détails d'une erreur de validation ; rien pour d'autres détails. */
export function lignesDetails(details: unknown): string[] {
  if (!Array.isArray(details)) return [];
  return details.flatMap((detail: unknown) => {
    if (typeof detail !== "object" || detail === null) return [];
    const { chemin, message } = detail as { chemin?: unknown; message?: unknown };
    if (typeof message !== "string") return [];
    return [typeof chemin === "string" && chemin !== "" ? `${chemin} : ${message}` : message];
  });
}

export function resultatErreur(code: string, message: string, details: string[] = []): ResultatOutil {
  const corps = details.length > 0 ? { code, message, details } : { code, message };
  return { isError: true, content: [{ type: "text", text: JSON.stringify(corps, null, 2) }] };
}

export function resultatErreurService(erreur: ErreurService): ResultatOutil {
  return resultatErreur(erreur.code, erreur.message, lignesDetails(erreur.details));
}

/** Erreur inattendue : message générique et référence ; le détail reste dans les journaux du conteneur. */
export function resultatErreurInattendue(reference: string): ResultatOutil {
  return resultatErreur("INTERNE", `Une erreur inattendue est survenue (réf. ${reference}).`);
}
