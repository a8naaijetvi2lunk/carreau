import { z } from "zod";
import { lireCorpsJson, reponseErreur, reponseOk } from "@/lib/reponse-api";
import { lireCookiesEntree, lireEtatEntree, TAILLE_MAX_CORPS_SESSIONS } from "@/modules/sessions";

const schema = z.strictObject({});

/** État du téléphone (spec §7), interrogé toutes les 2 à 5 s ; sert aussi de battement. */
export async function POST(requete: Request) {
  try {
    await lireCorpsJson(requete, schema, "État", TAILLE_MAX_CORPS_SESSIONS);
    return reponseOk((await lireEtatEntree(lireCookiesEntree(requete.headers))).etat);
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
