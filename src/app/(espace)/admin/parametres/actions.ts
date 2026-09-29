"use server";

import { revalidatePath } from "next/cache";
import { executerAction, type ResultatAction } from "@/lib/action";
import { erreurs } from "@/lib/erreurs";
import { lireChamp } from "@/lib/formulaire";
import { exigerActeur } from "@/modules/auth";
import { envoyerEmailTest } from "@/modules/emails";
import {
  enregistrerConservation,
  enregistrerEnvoiEmails,
  enregistrerValiditeInvitations,
} from "@/modules/parametres";

const CHEMIN = "/admin/parametres";

/** Nombre saisi ; vide ou non numérique : NaN, refusé par le service avec un message clair. */
function nombre(formulaire: FormData, nom: string): number {
  const texte = lireChamp(formulaire, nom).trim();
  return texte === "" ? Number.NaN : Number(texte);
}

async function enregistrer(action: () => Promise<void>): Promise<ResultatAction<null>> {
  const resultat = await executerAction(async () => {
    await action();
    return null;
  });
  if (resultat.ok) revalidatePath(CHEMIN);
  return resultat;
}

export async function enregistrerEnvoiAction(
  _etat: ResultatAction<null> | null,
  formulaire: FormData,
): Promise<ResultatAction<null>> {
  return enregistrer(async () =>
    enregistrerEnvoiEmails(await exigerActeur(), {
      cleApi: lireChamp(formulaire, "cleApi"),
      emailExpediteur: lireChamp(formulaire, "emailExpediteur"),
      nomExpediteur: lireChamp(formulaire, "nomExpediteur"),
    }),
  );
}

export async function enregistrerValiditeAction(
  _etat: ResultatAction<null> | null,
  formulaire: FormData,
): Promise<ResultatAction<null>> {
  return enregistrer(async () =>
    enregistrerValiditeInvitations(await exigerActeur(), {
      validiteInvitationJours: nombre(formulaire, "validiteInvitationJours"),
    }),
  );
}

export async function enregistrerConservationAction(
  _etat: ResultatAction<null> | null,
  formulaire: FormData,
): Promise<ResultatAction<null>> {
  return enregistrer(async () =>
    enregistrerConservation(await exigerActeur(), {
      conservationEvenementsJours: nombre(formulaire, "conservationEvenementsJours"),
      conservationResultatsJours: nombre(formulaire, "conservationResultatsJours"),
      contactDonnees: lireChamp(formulaire, "contactDonnees"),
    }),
  );
}

/** Envoi de test vers l'adresse du super-admin ; un échec d'envoi est remonté à l'écran (spec §9.3). */
export async function envoyerEmailTestAction(
  _etat: ResultatAction<null> | null,
  formulaire: FormData,
): Promise<ResultatAction<null>> {
  return executerAction(async () => {
    const envoi = await envoyerEmailTest(await exigerActeur(), { modele: lireChamp(formulaire, "modele") });
    if (!envoi.ok) throw erreurs.etat(envoi.message);
    return null;
  });
}
