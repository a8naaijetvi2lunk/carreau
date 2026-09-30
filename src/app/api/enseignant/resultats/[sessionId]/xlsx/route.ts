import { erreurs } from "@/lib/erreurs";
import { reponseErreur, reponseFichier } from "@/lib/reponse-api";
import { acteurCourant } from "@/modules/auth";
import { exporterResultatsXlsx } from "@/modules/resultats";

/** Export Excel des résultats (spec §9.1, décision D8 du plan du lot 7) : téléchargement de l'enseignant. */
export async function GET(
  _requete: Request,
  contexte: RouteContext<"/api/enseignant/resultats/[sessionId]/xlsx">,
) {
  try {
    const acteur = await acteurCourant();
    if (!acteur) throw erreurs.nonConnecte();
    const { sessionId } = await contexte.params;
    const fichier = await exporterResultatsXlsx(acteur, { sessionId });
    return reponseFichier(fichier.contenu, {
      nom: fichier.nom,
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
