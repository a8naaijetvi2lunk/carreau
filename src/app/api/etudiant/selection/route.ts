import { z } from "zod";
import { lireCorpsJson, reponseErreur, reponseOk } from "@/lib/reponse-api";
import { lireCookiesEntree, selectionnerReponses, TAILLE_MAX_CORPS_SESSIONS } from "@/modules/sessions";

const schema = z.strictObject({ rang: z.number(), selection: z.array(z.string()).max(8) });

/** Sélection en cours de la question courante, à chaque touche (spec §6.4, décision D7 du plan du lot 5). */
export async function POST(requete: Request) {
  try {
    const saisie = await lireCorpsJson(requete, schema, "Réponse", TAILLE_MAX_CORPS_SESSIONS);
    return reponseOk(await selectionnerReponses(lireCookiesEntree(requete.headers), saisie));
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
