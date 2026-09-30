"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executerAction, type ResultatAction } from "@/lib/action";
import { lireCase, lireChamp } from "@/lib/formulaire";
import { exigerActeur } from "@/modules/auth";
import {
  annulerSession,
  autoriserDemande,
  creerSession,
  demarrerSession,
  prolongerSession,
  refuserDemande,
  retirerParticipant,
  terminerSession,
} from "@/modules/sessions";

/** Liste des sessions, accueil et page de pilotage : statut et participants y sont affichés. */
function rafraichir(): void {
  revalidatePath("/enseignant");
  revalidatePath("/enseignant/sessions");
  revalidatePath("/enseignant/sessions/[sessionId]", "page");
}

/** Crée la session puis ouvre sa page de pilotage. */
export async function creerSessionAction(
  _etat: ResultatAction<null> | null,
  formulaire: FormData,
): Promise<ResultatAction<null>> {
  const resultat = await executerAction(async () =>
    creerSession(await exigerActeur(), {
      qcmId: lireChamp(formulaire, "qcmId"),
      classeId: lireChamp(formulaire, "classeId"),
      creneauPrevu: lireChamp(formulaire, "creneauPrevu"),
      noteVisible: lireCase(formulaire, "noteVisible"),
      correctionVisible: lireCase(formulaire, "correctionVisible"),
    }),
  );
  if (!resultat.ok) return resultat;
  rafraichir();
  redirect(`/enseignant/sessions/${resultat.donnees.id}`);
}

/** Appel d'un service de pilotage ; les pages sont rafraîchies s'il a réussi. */
async function executerEtRafraichir(fn: () => Promise<unknown>): Promise<ResultatAction<null>> {
  const resultat = await executerAction(async () => {
    await fn();
    return null;
  });
  if (resultat.ok) rafraichir();
  return resultat;
}

export async function demarrerSessionAction(sessionId: string): Promise<ResultatAction<null>> {
  return executerEtRafraichir(async () => demarrerSession(await exigerActeur(), { sessionId }));
}

export async function annulerSessionAction(sessionId: string): Promise<ResultatAction<null>> {
  return executerEtRafraichir(async () => annulerSession(await exigerActeur(), { sessionId }));
}

export async function prolongerSessionAction(
  sessionId: string,
  minutes: number,
): Promise<ResultatAction<null>> {
  return executerEtRafraichir(async () => prolongerSession(await exigerActeur(), { sessionId, minutes }));
}

export async function terminerSessionAction(sessionId: string): Promise<ResultatAction<null>> {
  return executerEtRafraichir(async () => terminerSession(await exigerActeur(), { sessionId }));
}

export async function retirerParticipantAction(participationId: string): Promise<ResultatAction<null>> {
  return executerEtRafraichir(async () => retirerParticipant(await exigerActeur(), { participationId }));
}

export async function autoriserDemandeAction(demandeId: string): Promise<ResultatAction<null>> {
  return executerEtRafraichir(async () => autoriserDemande(await exigerActeur(), { demandeId }));
}

export async function refuserDemandeAction(demandeId: string): Promise<ResultatAction<null>> {
  return executerEtRafraichir(async () => refuserDemande(await exigerActeur(), { demandeId }));
}
