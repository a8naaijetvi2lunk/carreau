import { erreurs } from "@/lib/erreurs";
import { reponseErreur, reponseFichier } from "@/lib/reponse-api";
import { acteurCourant } from "@/modules/auth";
import { exporterResultatsCsv } from "@/modules/resultats";

/** Export CSV des résultats (spec §9.1, décision D8 du plan du lot 7) : téléchargement de l'enseignant. */
export async function GET(
  _requete: Request,
  contexte: RouteContext<"/api/enseignant/resultats/[sessionId]/csv">,
) {
  try {
    const acteur = await acteurCourant();
    if (!acteur) throw erreurs.nonConnecte();
    const { sessionId } = await contexte.params;
    const fichier = await exporterResultatsCsv(acteur, { sessionId });
    return reponseFichier(fichier.contenu, { nom: fichier.nom, type: "text/csv; charset=utf-8" });
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
