"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { executerAction, type ResultatAction } from "@/lib/action";
import { lireCase, lireChamp } from "@/lib/formulaire";
import { lireIpClient } from "@/lib/ip";
import { connecter, poserCookieSession } from "@/modules/auth";

/** Adresse et mot de passe : session en attente, puis écran de double authentification. */
export async function connecterAction(
  _etat: ResultatAction<null> | null,
  formulaire: FormData,
): Promise<ResultatAction<null>> {
  const resultat = await executerAction(async () => {
    const session = await connecter({
      email: lireChamp(formulaire, "email"),
      motDePasse: lireChamp(formulaire, "motDePasse"),
      resterConnecte: lireCase(formulaire, "resterConnecte"),
      ip: lireIpClient(await headers()),
    });
    await poserCookieSession(session.jeton, null);
    return null;
  });
  // redirect() hors d'executerAction : il lève une erreur interne à Next.
  if (resultat.ok) redirect("/connexion/double-authentification");
  return resultat;
}
