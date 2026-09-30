import { z } from "zod";
import { lireCorpsJson, reponseErreur, reponseOk } from "@/lib/reponse-api";
import { lireCookiesEntree, lireCorrection, TAILLE_MAX_CORPS_SESSIONS } from "@/modules/sessions";

const schema = z.strictObject({});

/** Correction de l'examen sur le téléphone (spec §9.1, D11 du plan du lot 7), avec le même appareil. */
export async function POST(requete: Request) {
  try {
    await lireCorpsJson(requete, schema, "Correction", TAILLE_MAX_CORPS_SESSIONS);
    return reponseOk(await lireCorrection(lireCookiesEntree(requete.headers)));
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
