import type { ResultatAction } from "@/lib/action";

/** Résultat d'une action qui n'a qu'un message à afficher. */
export type ResultatMessage = { message: string };

export type ActionMessage = (
  etat: ResultatAction<ResultatMessage> | null,
  formulaire: FormData,
) => Promise<ResultatAction<ResultatMessage>>;
