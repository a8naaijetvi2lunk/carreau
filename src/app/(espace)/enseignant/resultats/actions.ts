"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executerAction, type ResultatAction } from "@/lib/action";
import { lireChamp, lireListe } from "@/lib/formulaire";
import { exigerActeur } from "@/modules/auth";
import { reglerVisibilite } from "@/modules/resultats";
import { creerRattrapage } from "@/modules/sessions";

/** Note et correction visibles, pour la session d'origine et ses rattrapages (D6). */
export async function reglerVisibiliteAction(
  sessionId: string,
  noteVisible: boolean,
  correctionVisible: boolean,
): Promise<ResultatAction<null>> {
  const resultat = await executerAction(async () => {
    await reglerVisibilite(await exigerActeur(), { sessionId, noteVisible, correctionVisible });
    return null;
  });
  if (resultat.ok) revalidatePath("/enseignant/resultats/[sessionId]", "page");
  return resultat;
}

/** Crée le rattrapage des absents cochés (D3) puis ouvre sa page de pilotage. */
export async function creerRattrapageAction(
  sessionId: string,
  _etat: ResultatAction<null> | null,
  formulaire: FormData,
): Promise<ResultatAction<null>> {
  const resultat = await executerAction(async () =>
    creerRattrapage(await exigerActeur(), {
      sessionId,
      etudiantIds: lireListe(formulaire, "etudiantId"),
      creneauPrevu: lireChamp(formulaire, "creneauPrevu"),
    }),
  );
  if (!resultat.ok) return resultat;
  revalidatePath("/enseignant");
  revalidatePath("/enseignant/sessions");
  revalidatePath("/enseignant/resultats/[sessionId]", "page");
  redirect(`/enseignant/sessions/${resultat.donnees.id}`);
}
