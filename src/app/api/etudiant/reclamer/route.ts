import { z } from "zod";
import { lireCorpsJson, reponseErreur, reponseOk } from "@/lib/reponse-api";
import {
  lireCookiesEntree,
  poserCookiesEntree,
  reclamerNom,
  TAILLE_MAX_CORPS_SESSIONS,
} from "@/modules/sessions";

const schema = z.strictObject({ etudiantId: z.string() });

/** Étape 3 (spec §6.2) : participation, reprise ou demande d'appareil ; cookie de l'appareil s'il est nouveau. */
export async function POST(requete: Request) {
  try {
    const saisie = await lireCorpsJson(requete, schema, "Réclamation", TAILLE_MAX_CORPS_SESSIONS);
    const resultat = await reclamerNom(lireCookiesEntree(requete.headers), saisie);
    return poserCookiesEntree(reponseOk(resultat.etat), resultat);
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
