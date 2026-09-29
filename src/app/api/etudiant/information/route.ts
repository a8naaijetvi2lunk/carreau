import { z } from "zod";
import { lireCorpsJson, reponseErreur, reponseOk } from "@/lib/reponse-api";
import { confirmerInformation, lireCookiesEntree, TAILLE_MAX_CORPS_SESSIONS } from "@/modules/sessions";

const schema = z.strictObject({});

/** Étape 4 (spec §6.2, amendement A2 du plan du lot 4) : lecture de l'écran d'information enregistrée. */
export async function POST(requete: Request) {
  try {
    await lireCorpsJson(requete, schema, "Information", TAILLE_MAX_CORPS_SESSIONS);
    return reponseOk((await confirmerInformation(lireCookiesEntree(requete.headers))).etat);
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
