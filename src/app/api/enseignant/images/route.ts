import { erreurs } from "@/lib/erreurs";
import { MESSAGES_IMAGE, TAILLE_MAX_IMAGE_OCTETS } from "@/lib/images";
import { lireCorpsBinaire, reponseErreur, reponseOk } from "@/lib/reponse-api";
import { acteurCourant } from "@/modules/auth";
import { televerserImage } from "@/modules/images";

/**
 * Téléversement d'une image de l'éditeur de QCM (décision D14 du plan du lot 3). Corps = octets bruts
 * de l'image, `Content-Type: application/octet-stream`. Succès : 201 `{ image: { id, largeur, hauteur } }`.
 */
export async function POST(requete: Request) {
  try {
    const acteur = await acteurCourant();
    if (!acteur) throw erreurs.nonConnecte();
    const octets = await lireCorpsBinaire(requete, TAILLE_MAX_IMAGE_OCTETS, MESSAGES_IMAGE.tropLourde);
    return reponseOk({ image: await televerserImage(acteur, { octets }) }, 201);
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
