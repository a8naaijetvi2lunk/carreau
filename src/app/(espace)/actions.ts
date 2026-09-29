"use server";

import { redirect } from "next/navigation";
import { executerAction } from "@/lib/action";
import { acteurCourant, deconnecter, effacerCookieSession } from "@/modules/auth";

/** Ferme la session en base et efface le cookie, puis retour à la connexion. */
export async function seDeconnecterAction(): Promise<void> {
  await executerAction(async () => {
    const acteur = await acteurCourant();
    if (acteur) await deconnecter(acteur);
    await effacerCookieSession();
    return null;
  });
  redirect("/connexion");
}
