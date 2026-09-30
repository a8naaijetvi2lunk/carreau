/**
 * Purges nocturnes (spec §2 et §14, lot 10 ; décision D5 du plan) : appelée depuis le conteneur par
 * scripts/purger.mjs, avec `Authorization: Bearer <CRON_SECRET>`. Fermée tant que CRON_SECRET n'est pas
 * configuré. Un refus n'écrit rien en base (pas de journal à gonfler de l'extérieur) : un avertissement
 * en console, sans la valeur présentée.
 */
import { env } from "@/lib/env";
import { erreurs } from "@/lib/erreurs";
import { statutBilan } from "@/lib/regles-purges";
import { reponseErreur, reponseOk } from "@/lib/reponse-api";
import { secretCronValide } from "@/lib/secret-cron";
import { executerPurges } from "@/modules/purges";

export const dynamic = "force-dynamic";

export async function POST(requete: Request): Promise<Response> {
  try {
    if (!secretCronValide(requete.headers.get("authorization"), env().CRON_SECRET)) {
      console.warn("[purges] Appel refusé : secret absent ou invalide.");
      throw erreurs.nonConnecte("Secret de la tâche planifiée absent ou invalide.");
    }
    const bilan = await executerPurges();
    return reponseOk(bilan, statutBilan(bilan));
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
