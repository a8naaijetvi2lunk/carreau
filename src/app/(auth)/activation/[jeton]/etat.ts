import type { ResultatAction } from "@/lib/action";

/**
 * État du formulaire d'activation : le résultat, et le prénom et le nom saisis, réaffichés après une
 * erreur (champs non contrôlés, décision D9 du plan du lot 10). Jamais les mots de passe. Hors du
 * fichier "use server", qui n'exporte que des fonctions asynchrones.
 */
export type EtatActivation = ResultatAction<null> & { valeurs: { prenom: string; nom: string } };
