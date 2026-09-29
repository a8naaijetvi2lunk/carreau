"use server";

import { redirect } from "next/navigation";
import { executerAction, type ResultatAction } from "@/lib/action";
import { erreurs } from "@/lib/erreurs";
import { lireChamp } from "@/lib/formulaire";
import { poserCookieSession } from "@/modules/auth";
import { activerCompte } from "@/modules/comptes";

const MESSAGE_CONFIRMATION = "Les deux mots de passe ne correspondent pas.";

/** Activation : compte créé, puis enrôlement de la double authentification. `jeton` est revalidé par le service. */
export async function activerCompteAction(
  jeton: string,
  _etat: ResultatAction<null> | null,
  formulaire: FormData,
): Promise<ResultatAction<null>> {
  const resultat = await executerAction(async () => {
    const motDePasse = lireChamp(formulaire, "motDePasse");
    if (motDePasse !== lireChamp(formulaire, "confirmation")) {
      throw erreurs.validation(MESSAGE_CONFIRMATION, [
        { chemin: "confirmation", message: MESSAGE_CONFIRMATION },
      ]);
    }
    const session = await activerCompte({
      jeton: String(jeton),
      nom: lireChamp(formulaire, "nom"),
      prenom: lireChamp(formulaire, "prenom"),
      motDePasse,
    });
    await poserCookieSession(session.jeton, null);
    return null;
  });
  if (resultat.ok) redirect("/connexion/double-authentification");
  return resultat;
}
