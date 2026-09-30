"use server";

import { revalidatePath } from "next/cache";
import { executerAction, type ResultatAction } from "@/lib/action";
import { lireChamp } from "@/lib/formulaire";
import { exigerActeur } from "@/modules/auth";
import { creerJetonMcp, revoquerJetonMcp, type JetonMcpCree } from "@/modules/mcp";

/** Crée un jeton ; le jeton en clair ne revient qu'ici, une seule fois (spec §10). */
export async function creerJetonAction(
  _etat: ResultatAction<JetonMcpCree> | null,
  formulaire: FormData,
): Promise<ResultatAction<JetonMcpCree>> {
  const resultat = await executerAction(async () =>
    creerJetonMcp(await exigerActeur(), {
      nom: lireChamp(formulaire, "nom"),
      portee: lireChamp(formulaire, "portee"),
    }),
  );
  if (resultat.ok) revalidatePath("/enseignant/mcp");
  return resultat;
}

export async function revoquerJetonAction(
  _etat: ResultatAction<null> | null,
  formulaire: FormData,
): Promise<ResultatAction<null>> {
  const resultat = await executerAction(async () => {
    await revoquerJetonMcp(await exigerActeur(), { jetonId: lireChamp(formulaire, "jetonId") });
    return null;
  });
  if (resultat.ok) revalidatePath("/enseignant/mcp");
  return resultat;
}
