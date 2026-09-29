import "server-only";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { ErreurService } from "@/lib/erreurs";
import { journaliser } from "./journaliser";

/**
 * Exécute un service et journalise ses refus d'accès (spec §12 : tout refus d'accès est
 * journalisé). L'écriture se fait après coup, hors de toute transaction du service : un refus
 * levé dans une transaction l'annule, l'entrée de journal doit survivre.
 */
export async function journaliserLesRefus<T>(
  acteur: ActeurUtilisateur,
  action: string,
  service: () => Promise<T>,
): Promise<T> {
  try {
    return await service();
  } catch (erreur) {
    if (erreur instanceof ErreurService && erreur.code === "ACCES_REFUSE") {
      await journaliser({
        acteur: { type: "utilisateur", id: acteur.id },
        action: "acces.refus",
        details: { action, role: acteur.role },
      });
    }
    throw erreur;
  }
}
