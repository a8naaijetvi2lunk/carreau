import { z } from "zod";
import { lireCorpsJson, reponseErreur, reponseOk } from "@/lib/reponse-api";
import { lireCookiesEntree, rechercherEtudiants, TAILLE_MAX_CORPS_SESSIONS } from "@/modules/sessions";

const schema = z.strictObject({ debut: z.string() });

/** Étape 2 (spec §6.2) : 8 étudiants au plus de la classe, d'après le ticket d'entrée. */
export async function POST(requete: Request) {
  try {
    const saisie = await lireCorpsJson(requete, schema, "Recherche", TAILLE_MAX_CORPS_SESSIONS);
    return reponseOk(await rechercherEtudiants(lireCookiesEntree(requete.headers), saisie));
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
