import { z } from "zod";
import { lireCorpsJson, reponseErreur, reponseOk } from "@/lib/reponse-api";
import { TAILLE_MAX_CORPS_EVENEMENTS } from "@/lib/regles-surveillance";
import { envoyerEvenements, lireCookiesEntree } from "@/modules/sessions";

const schema = z.strictObject({
  chargement: z.string(),
  evenements: z.array(z.strictObject({ n: z.number(), type: z.string() })).max(50),
});

/**
 * Événements de la page d'examen (spec §8.2, D7 du plan du lot 6), envoyés par `fetch` `keepalive`
 * (amendement A2) : la nature seulement, l'heure est celle du serveur.
 */
export async function POST(requete: Request) {
  try {
    const saisie = await lireCorpsJson(requete, schema, "Événements", TAILLE_MAX_CORPS_EVENEMENTS);
    return reponseOk(await envoyerEvenements(lireCookiesEntree(requete.headers), saisie));
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
