import "server-only";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { referenceErreur } from "./action";
import { ErreurService } from "./erreurs";
import { journaliserErreurInattendue } from "./journal-erreur";

/** Page de connexion des enseignants et de l'administration. */
export const CHEMIN_CONNEXION = "/connexion";

/**
 * Enveloppe l'appel d'un service depuis une page (Server Component) :
 * - erreurs internes de Next (redirect, notFound, rendu dynamique) → relancées telles quelles ;
 * - NON_CONNECTE → connexion ; INTROUVABLE et ACCES_REFUSE → page 404 (on ne révèle pas
 *   qu'une ressource existe) ;
 * - toute autre erreur → résumé assaini journalisé avec une référence, puis erreur de
 *   remplacement vers `error.tsx`. L'erreur d'origine n'est JAMAIS relancée : Next la
 *   journaliserait telle quelle, et le message d'une erreur SQL contient ses paramètres.
 */
export async function executerPage<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (erreur) {
    unstable_rethrow(erreur);
    if (erreur instanceof ErreurService) {
      if (erreur.code === "NON_CONNECTE") redirect(CHEMIN_CONNEXION);
      if (erreur.code === "INTROUVABLE" || erreur.code === "ACCES_REFUSE") notFound();
    }
    const reference = referenceErreur();
    journaliserErreurInattendue("page", reference, erreur);
    throw new Error(`Erreur inattendue pendant l'affichage (réf. ${reference})`);
  }
}
