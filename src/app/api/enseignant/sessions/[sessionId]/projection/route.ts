import { z } from "zod";
import { erreurs } from "@/lib/erreurs";
import { lireCorpsJson, reponseErreur, reponseOk } from "@/lib/reponse-api";
import { acteurCourant } from "@/modules/auth";
import { projeterSession, TAILLE_MAX_CORPS_SESSIONS } from "@/modules/sessions";

const schema = z.strictObject({});

/** Écran projeté (spec §7), toutes les 2 s : code en salle d'attente, connectés, départ (amendement A1). */
export async function POST(
  requete: Request,
  contexte: RouteContext<"/api/enseignant/sessions/[sessionId]/projection">,
) {
  try {
    const acteur = await acteurCourant();
    if (!acteur) throw erreurs.nonConnecte();
    await lireCorpsJson(requete, schema, "Projection", TAILLE_MAX_CORPS_SESSIONS);
    const { sessionId } = await contexte.params;
    return reponseOk(await projeterSession(acteur, { sessionId }));
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
