/**
 * Appel d'une route d'API de Carreau depuis le navigateur : POST JSON (le serveur exige
 * `Content-Type: application/json`, spec §2), sans cache, cookies du même site.
 */
export type ErreurApi = { code: string; message: string; details?: unknown };

export type ReponseApi<T> = { ok: true; donnees: T } | { ok: false; statut: number; erreur: ErreurApi };

export const MESSAGE_RESEAU = "Connexion impossible : vérifie ton réseau et réessaie.";

/** Réponse typée ; lève seulement si le réseau est coupé ou si la réponse n'est pas celle d'une route de Carreau. */
export async function appelerApi<T>(
  chemin: string,
  corps: unknown,
  signal?: AbortSignal,
): Promise<ReponseApi<T>> {
  const reponse = await fetch(chemin, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  const json: unknown = await reponse.json().catch(() => null);
  if (reponse.ok) return { ok: true, donnees: json as T };
  const erreur = (json as { erreur?: Partial<ErreurApi> } | null)?.erreur;
  if (!erreur || typeof erreur.code !== "string" || typeof erreur.message !== "string") {
    throw new Error(`Réponse inattendue du serveur (${reponse.status}).`);
  }
  return {
    ok: false,
    statut: reponse.status,
    erreur: {
      code: erreur.code,
      message: erreur.message,
      ...(erreur.details !== undefined ? { details: erreur.details } : {}),
    },
  };
}
