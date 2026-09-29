import type { ResultatAction } from "@/lib/action";

/** Résultat d'une invitation montré à l'inviteur : le lien l'est toujours (décision D3). */
export type InvitationAffichee = { email: string; lien: string; messageEnvoi: string | null };

/** Résultat d'une action sur une ligne du tableau (lien : invitation relancée). */
export type ResultatLigne = { message: string; lien: string | null };

export type ActionLigne = (
  etat: ResultatAction<ResultatLigne> | null,
  formulaire: FormData,
) => Promise<ResultatAction<ResultatLigne>>;
