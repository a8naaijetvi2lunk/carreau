/**
 * Résumé de l'examen affiché en salle d'attente et à l'enseignant (maquette « Salle d'attente »,
 * décision D12 du plan du lot 4) : nombre de questions, durée (tiers-temps compris), barème.
 */
import { formaterPoints } from "./points";
import type { ModeChrono } from "./regles-qcm";
import { dureeAvecTiersTempsS } from "./regles-session";
import { formaterDuree } from "./textes";

export type ResumeExamen = {
  questions: number;
  duree: string;
  dureeTiersTemps: string | null;
  bareme: string;
};

export type QcmAResumer = {
  modeChrono: ModeChrono;
  dureeGlobaleS: number | null;
  dureeQuestionS: number | null;
  questions: { pointsBonne: number; pointsMauvaise: number; pointsVide: number; dureeS: number | null }[];
};

/** Durée ou barème qui changent d'une question à l'autre. */
export const VARIABLE = "Variable selon les questions";

function texteBareme(q: QcmAResumer["questions"][number]): string {
  const base = `${formaterPoints(q.pointsBonne)} juste · ${formaterPoints(q.pointsMauvaise)} faux`;
  return q.pointsVide === 0 ? base : `${base} · ${formaterPoints(q.pointsVide)} sans réponse`;
}

function durees(qcm: QcmAResumer, tiersTemps: boolean): { duree: string; dureeTiersTemps: string | null } {
  if (qcm.modeChrono === "global") {
    const secondes = qcm.dureeGlobaleS ?? 0;
    return {
      duree: formaterDuree(secondes),
      dureeTiersTemps: tiersTemps ? formaterDuree(dureeAvecTiersTempsS(secondes)) : null,
    };
  }
  if (qcm.modeChrono === "par_question") {
    const toutes = new Set(qcm.questions.map((q) => q.dureeS ?? qcm.dureeQuestionS ?? 0));
    const [unique] = toutes;
    if (toutes.size === 1 && unique !== undefined) {
      return {
        duree: `${formaterDuree(unique)} par question`,
        dureeTiersTemps: tiersTemps ? `${formaterDuree(dureeAvecTiersTempsS(unique))} par question` : null,
      };
    }
    return { duree: VARIABLE, dureeTiersTemps: tiersTemps ? "Chaque durée allongée d’un tiers" : null };
  }
  return { duree: "Sans limite de temps", dureeTiersTemps: null };
}

/** Résumé d'un QCM ; `tiersTemps` : durée allongée pour l'étudiant qui y a droit (spec §6.5). */
export function resumerExamen(qcm: QcmAResumer, tiersTemps: boolean): ResumeExamen {
  const baremes = new Set(qcm.questions.map(texteBareme));
  const [bareme] = baremes;
  return {
    questions: qcm.questions.length,
    ...durees(qcm, tiersTemps),
    bareme: baremes.size === 1 && bareme !== undefined ? bareme : VARIABLE,
  };
}
