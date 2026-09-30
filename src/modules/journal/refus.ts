import "server-only";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { ErreurService } from "@/lib/erreurs";
import { journaliser } from "./journaliser";

/**
 * Exécute un service et journalise ses refus d'accès (spec §12 : tout refus d'accès est
 * journalisé) : rôle insuffisant (`ACCES_REFUSE`) ou ressource d'un autre compte
 * (`erreurs.ressourceAutrui`, qui répond « introuvable »). L'écriture se fait après coup, hors
 * de toute transaction du service : un refus levé dans une transaction l'annule, l'entrée de
 * journal doit survivre.
 */
export async function journaliserLesRefus<T>(
  acteur: ActeurUtilisateur,
  action: string,
  service: () => Promise<T>,
): Promise<T> {
  try {
    return await service();
  } catch (erreur) {
    if (erreur instanceof ErreurService && (erreur.code === "ACCES_REFUSE" || erreur.refusAcces)) {
      const details: Record<string, unknown> = erreur.refusAcces
        ? { action, role: acteur.role, motif: "ressource_autrui" }
        : { action, role: acteur.role };
      // Refus venu d'un assistant (décision D2 du plan du lot 8) : le jeton utilisé est retrouvable.
      if (acteur.jetonMcp) details.jetonMcpId = acteur.jetonMcp.id;
      await journaliser({ acteur: { type: "utilisateur", id: acteur.id }, action: "acces.refus", details });
    }
    throw erreur;
  }
}
