import { formaterDateCourte } from "@/lib/dates";
import { formaterNote } from "@/lib/points";
import { LIBELLES_STATUT_RESULTAT } from "@/lib/regles-resultats";
import { formaterDuree } from "@/lib/textes";
import type { LigneResultat, RattrapagePrevu } from "@/lib/vue-resultats";

/** Note d'une ligne : « 14,5 », sinon le statut (« En cours », « Absent »). */
export function libelleNote(l: Pick<LigneResultat, "statut" | "note">): string {
  return l.statut === "present" && l.note !== null
    ? formaterNote(l.note)
    : LIBELLES_STATUT_RESULTAT[l.statut];
}

export function libelleDuree(secondes: number | null): string {
  return secondes === null ? "—" : formaterDuree(secondes);
}

/** « Rattrapage prévu le 30/09/2026 10:00 », « Rattrapage prévu » ou « Rattrapage en cours ». */
export function libelleRattrapagePrevu(r: RattrapagePrevu): string {
  if (r.statut === "en_cours") return "Rattrapage en cours";
  return r.creneauPrevuLe
    ? `Rattrapage prévu le ${formaterDateCourte(new Date(r.creneauPrevuLe))}`
    : "Rattrapage prévu";
}
