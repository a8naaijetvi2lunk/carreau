import { PERIODE_EXAMEN_MS, TOLERANCE_ECHEANCE_MS } from "./regles-examen";
import type { EtatEntree } from "./vue-entree";

/**
 * Période d'interrogation de l'état du téléphone selon l'étape (spec §7, décision D16 du plan du
 * lot 4) ; null : aucune interrogation (saisie en cours, écran final). `maintenantServeurMs` : heure
 * du serveur estimée par le navigateur. Pendant l'examen, 5 s ou juste après l'expiration de
 * l'échéance (décision D14 du plan du lot 5) ; rien sur l'écran de fin.
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
    case "question": {
      if (etat.echeance === null) return PERIODE_EXAMEN_MS;
      // Juste après l'expiration (tolérance comprise) : la question suivante arrive sans attendre 5 s.
      const expiration = Date.parse(etat.echeance) + TOLERANCE_ECHEANCE_MS + 300;
      return Math.max(300, Math.min(PERIODE_EXAMEN_MS, expiration - maintenantServeurMs));
    }
    default:
      return null;
  }
}
