/** Petits textes d'interface partagés. */

/** « 1 étudiant », « 28 étudiants » (le pluriel commence à 2, comme en français). */
export function pluriel(n: number, singulier: string, plurielTexte: string): string {
  return `${n} ${n > 1 ? plurielTexte : singulier}`;
}

function decomposer(secondes: number): { h: number; m: number; s: number } {
  return { h: Math.floor(secondes / 3600), m: Math.floor((secondes % 3600) / 60), s: secondes % 60 };
}

/** Durée lisible : « 45 s », « 1 min 30 s », « 20 min », « 1 h 05 ». */
export function formaterDuree(secondes: number): string {
  const { h, m, s } = decomposer(secondes);
  if (h > 0) return m > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
  if (m > 0) return s > 0 ? `${m} min ${s} s` : `${m} min`;
  return `${s} s`;
}

/** Chrono affiché (maquette « Question avec code ») : « 12:48 », « 00:45 », « 1:30:00 ». */
export function formaterChrono(secondes: number): string {
  const { h, m, s } = decomposer(secondes);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
