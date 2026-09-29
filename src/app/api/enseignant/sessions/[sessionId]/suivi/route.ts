import { z } from "zod";
import { erreurs } from "@/lib/erreurs";
import { lireCorpsJson, reponseErreur, reponseOk } from "@/lib/reponse-api";
import { acteurCourant } from "@/modules/auth";
import { suivreSession, TAILLE_MAX_CORPS_SESSIONS } from "@/modules/sessions";

const schema = z.strictObject({});

/** Suivi de la page de pilotage (spec §7), toutes les 3 s : participants, absents, demandes, code. */
export async function POST(
  requete: Request,
  contexte: RouteContext<"/api/enseignant/sessions/[sessionId]/suivi">,
) {
  try {
    const acteur = await acteurCourant();
    if (!acteur) throw erreurs.nonConnecte();
    await lireCorpsJson(requete, schema, "Suivi", TAILLE_MAX_CORPS_SESSIONS);
    const { sessionId } = await contexte.params;
    return reponseOk(await suivreSession(acteur, { sessionId }));
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
