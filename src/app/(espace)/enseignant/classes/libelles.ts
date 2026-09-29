import { pluriel } from "@/lib/textes";

/** « 28 étudiants · dont 1 avec tiers-temps » (maquette « Classes »). */
export function libelleEffectif(effectif: number, tiersTemps: number): string {
  const base = pluriel(effectif, "étudiant", "étudiants");
  return tiersTemps > 0 ? `${base} · dont ${tiersTemps} avec tiers-temps` : base;
}
