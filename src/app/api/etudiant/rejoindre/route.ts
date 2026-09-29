import { z } from "zod";
import { lireIpClient } from "@/lib/ip";
import { lireCorpsJson, reponseErreur, reponseOk } from "@/lib/reponse-api";
import {
  lireCookiesEntree,
  poserCookiesEntree,
  rejoindreSession,
  TAILLE_MAX_CORPS_SESSIONS,
} from "@/modules/sessions";

const schema = z.strictObject({ code: z.string() });

/**
 * Étape 1 de l'entrée (spec §6.2) : le code saisi, ou lu dans le fragment du QR code, arrive en POST
 * (jamais dans l'URL). Succès : l'état du téléphone, et le cookie du ticket d'entrée.
 */
export async function POST(requete: Request) {
  try {
    const { code } = await lireCorpsJson(requete, schema, "Code", TAILLE_MAX_CORPS_SESSIONS);
    const resultat = await rejoindreSession(lireCookiesEntree(requete.headers), {
      code,
      ip: lireIpClient(requete.headers),
    });
    return poserCookiesEntree(reponseOk(resultat.etat), resultat);
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
