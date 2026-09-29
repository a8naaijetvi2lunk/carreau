import type { EtatEntree } from "./vue-entree";

/**
 * Période d'interrogation de l'état du téléphone selon l'étape (spec §7, décision D16 du plan du
 * lot 4) ; null : aucune interrogation (saisie en cours, écran final). `maintenantServeurMs` : heure
 * du serveur estimée par le navigateur.
 */
export function periodeEntreeMs(etat: EtatEntree, maintenantServeurMs: number): number | null {
  switch (etat.etape) {
    case "information":
      return 5_000;
    case "attente":
      return 2_000;
    case "demarrage":
      return Date.parse(etat.demarreLe) > maintenantServeurMs ? 2_000 : 5_000;
    case "demande":
      return etat.statut === "en_attente" ? 2_000 : null;
    default:
      return null;
  }
}
