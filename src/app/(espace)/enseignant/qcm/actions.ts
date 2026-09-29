"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executerAction, type ResultatAction } from "@/lib/action";
import { lireCase, lireChamp, lireNombre } from "@/lib/formulaire";
import { exigerActeur } from "@/modules/auth";
import {
  ajouterQuestion,
  archiverQcm,
  creerQcm,
  deplacerQuestion,
  enregistrerQuestion,
  lierQuestion,
  marquerPret,
  modifierParametres,
  repasserEnBrouillon,
  restaurerQcm,
  supprimerQuestion,
  type SaisieQuestion,
} from "@/modules/qcm";

/** Liste des QCM et page de chaque QCM : titre, statut, questions et date de modification y sont affichés. */
function rafraichir(): void {
  revalidatePath("/enseignant/qcm");
  revalidatePath("/enseignant/qcm/[qcmId]", "page");
}

/** Crée le QCM puis ouvre son éditeur, sur la question 1. */
export async function creerQcmAction(
  _etat: ResultatAction<null> | null,
  formulaire: FormData,
): Promise<ResultatAction<null>> {
  const resultat = await executerAction(async () =>
    creerQcm(await exigerActeur(), { titre: lireChamp(formulaire, "titre") }),
  );
  if (!resultat.ok) return resultat;
  rafraichir();
  redirect(`/enseignant/qcm/${resultat.donnees.id}`);
}

/** Appel d'un service ; la liste des QCM et la page du QCM sont rafraîchies si tout s'est bien passé. */
async function executerEtRafraichir<T>(fn: () => Promise<T>): Promise<ResultatAction<T>> {
  const resultat = await executerAction(fn);
  if (resultat.ok) rafraichir();
  return resultat;
}

/**
 * Enregistrement automatique d'une question entière (décision D8). La saisie vient du navigateur :
 * le service la revalide entièrement (schéma strict, bornes, propriété des images).
 */
export async function enregistrerQuestionAction(
  saisie: SaisieQuestion,
): Promise<ResultatAction<{ modifieLe: Date }>> {
  return executerEtRafraichir(async () => enregistrerQuestion(await exigerActeur(), saisie));
}

export async function ajouterQuestionAction(qcmId: string): Promise<ResultatAction<{ id: string }>> {
  return executerEtRafraichir(async () => ajouterQuestion(await exigerActeur(), { qcmId }));
}

export async function supprimerQuestionAction(
  questionId: string,
): Promise<ResultatAction<{ qcmId: string; voisineId: string | null }>> {
  return executerEtRafraichir(async () => supprimerQuestion(await exigerActeur(), { questionId }));
}

export async function deplacerQuestionAction(
  questionId: string,
  sens: "haut" | "bas",
): Promise<ResultatAction<null>> {
  return executerEtRafraichir(async () => {
    await deplacerQuestion(await exigerActeur(), { questionId, sens });
    return null;
  });
}

export async function lierQuestionAction(
  questionId: string,
  lieeASuivante: boolean,
): Promise<ResultatAction<null>> {
  return executerEtRafraichir(async () => {
    await lierQuestion(await exigerActeur(), { questionId, lieeASuivante });
    return null;
  });
}

export async function marquerPretAction(qcmId: string): Promise<ResultatAction<null>> {
  return executerEtRafraichir(async () => {
    await marquerPret(await exigerActeur(), { qcmId });
    return null;
  });
}

export async function repasserEnBrouillonAction(qcmId: string): Promise<ResultatAction<null>> {
  return executerEtRafraichir(async () => {
    await repasserEnBrouillon(await exigerActeur(), { qcmId });
    return null;
  });
}

export async function archiverQcmAction(qcmId: string): Promise<ResultatAction<null>> {
  return executerEtRafraichir(async () => {
    await archiverQcm(await exigerActeur(), { qcmId });
    return null;
  });
}

export async function restaurerQcmAction(qcmId: string): Promise<ResultatAction<null>> {
  return executerEtRafraichir(async () => {
    await restaurerQcm(await exigerActeur(), { qcmId });
    return null;
  });
}

/** Onglet « Paramètres » : formulaire classique, enregistré par son bouton. */
export async function modifierParametresAction(
  _etat: ResultatAction<{ message: string }> | null,
  formulaire: FormData,
): Promise<ResultatAction<{ message: string }>> {
  return executerEtRafraichir(async () => {
    await modifierParametres(await exigerActeur(), {
      qcmId: lireChamp(formulaire, "qcmId"),
      titre: lireChamp(formulaire, "titre"),
      modeChrono: lireChamp(formulaire, "modeChrono"),
      dureeGlobaleMinutes: lireNombre(formulaire, "dureeGlobaleMinutes"),
      dureeQuestionS: lireNombre(formulaire, "dureeQuestionS"),
      noteVisibleDefaut: lireCase(formulaire, "noteVisibleDefaut"),
      correctionVisibleDefaut: lireCase(formulaire, "correctionVisibleDefaut"),
    });
    return { message: "Paramètres enregistrés." };
  });
}
