import { erreurs } from "@/lib/erreurs";
import { reponseErreur, reponseImage } from "@/lib/reponse-api";
import { acteurCourant } from "@/modules/auth";
import { lireImage } from "@/modules/images";

/**
 * Lecture contrôlée d'une image (spec §2 et §11.1) : réservée à son propriétaire au lot 3 ; le lot 5
 * l'ouvrira à la participation dont la question courante (ou la correction publiée) la cite.
 */
export async function GET(_requete: Request, contexte: RouteContext<"/api/images/[imageId]">) {
  try {
    const acteur = await acteurCourant();
    if (!acteur) throw erreurs.nonConnecte();
    const { imageId } = await contexte.params;
    const { contenu } = await lireImage(acteur, { imageId });
    return reponseImage(contenu);
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
