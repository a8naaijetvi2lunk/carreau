"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executerAction, type ResultatAction } from "@/lib/action";
import { lireChamp } from "@/lib/formulaire";
import { exigerActeur } from "@/modules/auth";
import { creerQcm } from "@/modules/qcm";

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
