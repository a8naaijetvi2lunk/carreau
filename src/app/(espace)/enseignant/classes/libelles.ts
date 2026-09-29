/** « 1 étudiant », « 28 étudiants » (le pluriel commence à 2, comme en français). */
export function pluriel(n: number, singulier: string, plurielTexte: string): string {
  return `${n} ${n > 1 ? plurielTexte : singulier}`;
}

/** « 28 étudiants · dont 1 avec tiers-temps » (maquette « Classes »). */
export function libelleEffectif(effectif: number, tiersTemps: number): string {
  const base = pluriel(effectif, "étudiant", "étudiants");
  return tiersTemps > 0 ? `${base} · dont ${tiersTemps} avec tiers-temps` : base;
}
