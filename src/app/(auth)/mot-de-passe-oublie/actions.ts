"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { executerAction, type ResultatAction } from "@/lib/action";
import { lireChamp } from "@/lib/formulaire";
import { lireIpClient } from "@/lib/ip";
import { demanderReinitialisation } from "@/modules/comptes";

/**
 * Réponse identique, en contenu comme en durée, que le compte existe ou non : la recherche du
 * compte et l'envoi de l'email s'exécutent après la réponse (after).
 */
export async function demanderReinitialisationAction(
  _etat: ResultatAction<null> | null,
  formulaire: FormData,
): Promise<ResultatAction<null>> {
  return executerAction(async () => {
    const travail = await demanderReinitialisation({
      email: lireChamp(formulaire, "email"),
      ip: lireIpClient(await headers()),
    });
    after(travail);
    return null;
  });
}
