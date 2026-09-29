"use server";

import { redirect } from "next/navigation";
import { executerAction, type ResultatAction } from "@/lib/action";
import { erreurs } from "@/lib/erreurs";
import { lireChamp } from "@/lib/formulaire";
import { reinitialiserMotDePasse } from "@/modules/comptes";

const MESSAGE_CONFIRMATION = "Les deux mots de passe ne correspondent pas.";

/** Nouveau mot de passe : sessions fermées par le service, retour à la connexion. */
export async function reinitialiserMotDePasseAction(
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
    await reinitialiserMotDePasse({ jeton: String(jeton), motDePasse });
    return null;
  });
  if (resultat.ok) redirect("/connexion?motDePasse=modifie");
  return resultat;
}
