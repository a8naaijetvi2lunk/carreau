import { unstable_rethrow } from "next/navigation";
import { ErreurService, type CodeErreur } from "./erreurs";
import { journaliserErreurInattendue } from "./journal-erreur";

export type ResultatAction<T> =
  | { ok: true; donnees: T }
  | { ok: false; erreur: { code: CodeErreur | "INTERNE"; message: string; details?: unknown } };

/** Référence courte (8 caractères hexadécimaux) pour retrouver une erreur dans les journaux. */
export function referenceErreur(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
}

/**
 * Enveloppe l'appel d'un service depuis une Server Action :
 * ErreurService → `{ ok: false, erreur }` typé ; redirect() et notFound() de Next
 * → relancés ; toute autre erreur → journalisée avec une référence, message générique.
 */
export async function executerAction<T>(fn: () => Promise<T>): Promise<ResultatAction<T>> {
  try {
    return { ok: true, donnees: await fn() };
  } catch (erreur) {
    unstable_rethrow(erreur);
    if (erreur instanceof ErreurService) {
      return {
        ok: false,
        erreur: {
          code: erreur.code,
          message: erreur.message,
          ...(erreur.details !== undefined ? { details: erreur.details } : {}),
        },
      };
    }
    const reference = referenceErreur();
    journaliserErreurInattendue("action", reference, erreur);
    return {
      ok: false,
      erreur: { code: "INTERNE", message: `Une erreur inattendue est survenue (réf. ${reference})` },
    };
  }
}
