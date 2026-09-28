import "server-only";
import { notFound, redirect } from "next/navigation";
import { ErreurService } from "./erreurs";

/** Page de connexion des enseignants et de l'administration. */
export const CHEMIN_CONNEXION = "/connexion";

/**
 * Enveloppe l'appel d'un service depuis une page (Server Component) :
 * NON_CONNECTE → connexion ; INTROUVABLE et ACCES_REFUSE → page 404 (on ne révèle pas
 * qu'une ressource existe) ; toute autre erreur → relancée vers `error.tsx`.
 */
export async function executerPage<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (erreur) {
    if (erreur instanceof ErreurService) {
      if (erreur.code === "NON_CONNECTE") redirect(CHEMIN_CONNEXION);
      if (erreur.code === "INTROUVABLE" || erreur.code === "ACCES_REFUSE") notFound();
    }
    throw erreur;
  }
}
