import { appelerApi, type ReponseApi } from "@/lib/appel-api";
import type { LotEvenementsTelephone } from "@/lib/regles-surveillance";
import type { EtatEntree, ResultatRecherche } from "@/lib/vue-entree";

/** Appels des routes d'entrée (spec §6.2) : les cookies du téléphone sont posés et lus par le serveur. */

export function envoyerCode(code: string): Promise<ReponseApi<EtatEntree>> {
  return appelerApi("/api/etudiant/rejoindre", { code });
}

export function chercherNom(debut: string): Promise<ReponseApi<ResultatRecherche>> {
  return appelerApi("/api/etudiant/recherche", { debut });
}

export function choisirNom(etudiantId: string): Promise<ReponseApi<EtatEntree>> {
  return appelerApi("/api/etudiant/reclamer", { etudiantId });
}

export function validerInformation(): Promise<ReponseApi<EtatEntree>> {
  return appelerApi("/api/etudiant/information", {});
}

export function lireEtat(signal?: AbortSignal): Promise<ReponseApi<EtatEntree>> {
  return appelerApi("/api/etudiant/etat", {}, signal);
}

/** Sélection en cours de la question courante (brouillon), à chaque touche. */
export function enregistrerSelection(
  rang: number,
  selection: string[],
): Promise<ReponseApi<{ enregistree: true }>> {
  return appelerApi("/api/etudiant/selection", { rang, selection });
}

/** Validation de la question courante : l'état suivant (question ou fin). */
export function validerReponse(rang: number, selection: string[]): Promise<ReponseApi<EtatEntree>> {
  return appelerApi("/api/etudiant/reponse", { rang, selection });
}

/**
 * Lot d'événements de la page d'examen (D7, amendement A2) : `fetch` avec `keepalive`, qui part même
 * quand la page se ferme. Vrai s'il est traité pour de bon (enregistré, ou refusé : 409, 422) ; faux
 * pour réessayer (réseau coupé, limiteur, erreur du serveur).
 */
export async function envoyerEvenements(lot: LotEvenementsTelephone): Promise<boolean> {
  try {
    const reponse = await fetch("/api/etudiant/evenements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lot),
      credentials: "same-origin",
      cache: "no-store",
      keepalive: true,
    });
    return reponse.ok || reponse.status === 409 || reponse.status === 422;
  } catch {
    return false;
  }
}
