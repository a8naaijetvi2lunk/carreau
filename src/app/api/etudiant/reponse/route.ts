import { z } from "zod";
import { lireCorpsJson, reponseErreur, reponseOk } from "@/lib/reponse-api";
import { lireCookiesEntree, TAILLE_MAX_CORPS_SESSIONS, validerReponse } from "@/modules/sessions";

const schema = z.strictObject({ rang: z.number(), selection: z.array(z.string()).max(8) });

/**
 * Validation de la question courante (spec §6.4, décision D8 du plan du lot 5) : idempotente ; renvoie
 * le nouvel état du téléphone (question suivante ou écran de fin).
 */
export async function POST(requete: Request) {
  try {
    const saisie = await lireCorpsJson(requete, schema, "Réponse", TAILLE_MAX_CORPS_SESSIONS);
    return reponseOk((await validerReponse(lireCookiesEntree(requete.headers), saisie)).etat);
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
