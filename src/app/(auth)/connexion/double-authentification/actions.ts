"use server";

import { redirect } from "next/navigation";
import { executerAction, type ResultatAction } from "@/lib/action";
import { lireChamp } from "@/lib/formulaire";
import {
  effacerCookieSession,
  jetonSessionCourant,
  poserCookieSession,
  supprimerSessionEnAttente,
  validerDoubleAuth,
} from "@/modules/auth";

/** Code TOTP : session complète (nouveau jeton), puis accueil de l'espace connecté. */
export async function validerDoubleAuthAction(
  _etat: ResultatAction<null> | null,
  formulaire: FormData,
): Promise<ResultatAction<null>> {
  const resultat = await executerAction(async () => {
    const session = await validerDoubleAuth({
      jetonSession: (await jetonSessionCourant()) ?? "",
      code: lireChamp(formulaire, "code"),
    });
    await poserCookieSession(session.jeton, session.resterConnecte ? session.expireLe : null);
    return null;
  });
  if (resultat.ok) redirect("/enseignant");
  return resultat;
}

/** Abandon : la session en attente est supprimée, retour à la connexion. */
export async function abandonnerDoubleAuthAction(): Promise<void> {
  await executerAction(async () => {
    const jeton = await jetonSessionCourant();
    if (jeton) await supprimerSessionEnAttente(jeton);
    await effacerCookieSession();
    return null;
  });
  redirect("/connexion");
}
