import { appelerApi, type ReponseApi } from "@/lib/appel-api";
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
