import { reponseErreur, reponseImage } from "@/lib/reponse-api";
import { acteurCourant } from "@/modules/auth";
import { lireImage } from "@/modules/images";
import { lireCookiesEntree, lireImageExamen } from "@/modules/sessions";

/**
 * Lecture contrôlée d'une image (spec §2 et §11.1) : l'enseignant connecté lit ses images (lot 3) ;
 * sans session enseignante, le téléphone lit l'image de sa question courante (décision D12 du plan du
 * lot 5). Tout autre cas répond 404.
 */
export async function GET(requete: Request, contexte: RouteContext<"/api/images/[imageId]">) {
  try {
    const { imageId } = await contexte.params;
    const acteur = await acteurCourant();
    const { contenu } = acteur
      ? await lireImage(acteur, { imageId })
      : await lireImageExamen(lireCookiesEntree(requete.headers), { imageId });
    return reponseImage(contenu);
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
