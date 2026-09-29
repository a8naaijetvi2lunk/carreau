"use server";

import { revalidatePath } from "next/cache";
import { executerAction, type ResultatAction } from "@/lib/action";
import { lireChamp } from "@/lib/formulaire";
import { exigerActeur } from "@/modules/auth";
import {
  annulerInvitation,
  changerRole,
  desactiverCompte,
  inviter,
  reactiverCompte,
  reinitialiserDoubleAuth,
  relancerInvitation,
} from "@/modules/comptes";
import type { InvitationAffichee, ResultatLigne } from "./types";

const CHEMIN = "/admin/enseignants";

export async function inviterAction(
  _etat: ResultatAction<InvitationAffichee> | null,
  formulaire: FormData,
): Promise<ResultatAction<InvitationAffichee>> {
  const resultat = await executerAction(async () => {
    const emise = await inviter(await exigerActeur(), {
      email: lireChamp(formulaire, "email"),
      role: lireChamp(formulaire, "role"),
    });
    return {
      email: emise.email,
      lien: emise.lien,
      messageEnvoi: emise.envoi.ok ? null : emise.envoi.message,
    };
  });
  if (resultat.ok) revalidatePath(CHEMIN);
  return resultat;
}

async function surLigne(action: () => Promise<ResultatLigne>): Promise<ResultatAction<ResultatLigne>> {
  const resultat = await executerAction(action);
  if (resultat.ok) revalidatePath(CHEMIN);
  return resultat;
}

export async function relancerInvitationAction(
  _etat: ResultatAction<ResultatLigne> | null,
  formulaire: FormData,
): Promise<ResultatAction<ResultatLigne>> {
  return surLigne(async () => {
    const emise = await relancerInvitation(await exigerActeur(), {
      invitationId: lireChamp(formulaire, "invitationId"),
    });
    return {
      message: emise.envoi.ok
        ? "Invitation relancée : un nouvel email est parti."
        : `Invitation relancée. ${emise.envoi.message}`,
      lien: emise.lien,
    };
  });
}

export async function annulerInvitationAction(
  _etat: ResultatAction<ResultatLigne> | null,
  formulaire: FormData,
): Promise<ResultatAction<ResultatLigne>> {
  return surLigne(async () => {
    await annulerInvitation(await exigerActeur(), { invitationId: lireChamp(formulaire, "invitationId") });
    return { message: "Invitation annulée.", lien: null };
  });
}

export async function desactiverCompteAction(
  _etat: ResultatAction<ResultatLigne> | null,
  formulaire: FormData,
): Promise<ResultatAction<ResultatLigne>> {
  return surLigne(async () => {
    await desactiverCompte(await exigerActeur(), { utilisateurId: lireChamp(formulaire, "utilisateurId") });
    return { message: "Compte désactivé.", lien: null };
  });
}

export async function reactiverCompteAction(
  _etat: ResultatAction<ResultatLigne> | null,
  formulaire: FormData,
): Promise<ResultatAction<ResultatLigne>> {
  return surLigne(async () => {
    await reactiverCompte(await exigerActeur(), { utilisateurId: lireChamp(formulaire, "utilisateurId") });
    return { message: "Compte réactivé.", lien: null };
  });
}

export async function reinitialiserDoubleAuthAction(
  _etat: ResultatAction<ResultatLigne> | null,
  formulaire: FormData,
): Promise<ResultatAction<ResultatLigne>> {
  return surLigne(async () => {
    await reinitialiserDoubleAuth(await exigerActeur(), {
      utilisateurId: lireChamp(formulaire, "utilisateurId"),
    });
    return {
      message: "Double authentification réinitialisée : elle sera configurée à la prochaine connexion.",
      lien: null,
    };
  });
}

export async function changerRoleAction(
  _etat: ResultatAction<ResultatLigne> | null,
  formulaire: FormData,
): Promise<ResultatAction<ResultatLigne>> {
  return surLigne(async () => {
    await changerRole(await exigerActeur(), {
      utilisateurId: lireChamp(formulaire, "utilisateurId"),
      role: lireChamp(formulaire, "role"),
    });
    return { message: "Rôle modifié.", lien: null };
  });
}
