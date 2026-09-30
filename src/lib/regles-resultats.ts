/**
 * Règles des résultats (spec §9.1 ; décisions D5 et D8 du plan du lot 7) : statistiques, tri du
 * tableau et des exports, libellés. Pures : partagées par le module resultats et les pages.
 */
import { nomComplet } from "./regles-session";
import type { LigneResultat, StatutResultat } from "./vue-resultats";

/** Indice élevé : carte « Indice de suspicion ≥ 60 » et couleur orange foncé (D14 du lot 6). */
export const SEUIL_INDICE_ELEVE = 60;

export const LIBELLES_STATUT_RESULTAT: Record<StatutResultat, string> = {
  present: "Présent",
  en_cours: "En cours",
  absent: "Absent",
};

function arrondi(valeur: number): number {
  return Math.round(valeur * 100) / 100;
}

/** Moyenne arrondie au centième ; null sans valeur. */
export function moyenne(valeurs: readonly number[]): number | null {
  if (valeurs.length === 0) return null;
  return arrondi(valeurs.reduce((somme, v) => somme + v, 0) / valeurs.length);
}

/** Médiane arrondie au centième (moyenne des deux valeurs centrales pour un nombre pair) ; null sans valeur. */
export function mediane(valeurs: readonly number[]): number | null {
  if (valeurs.length === 0) return null;
  const tries = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(tries.length / 2);
  const haut = tries[milieu] ?? 0;
  return arrondi(tries.length % 2 === 1 ? haut : ((tries[milieu - 1] ?? 0) + haut) / 2);
}

const RANG_STATUT: Record<StatutResultat, number> = { present: 0, en_cours: 1, absent: 2 };

type Nomme = Pick<LigneResultat, "nom" | "prenom">;

/** Ordre alphabétique « NOM Prénom » (exports, D8). */
export function comparerNoms(a: Nomme, b: Nomme): number {
  return nomComplet(a.prenom, a.nom).localeCompare(nomComplet(b.prenom, b.nom), "fr");
}

/** Tableau des résultats (D5) : présents par note décroissante puis nom, en cours, absents par nom. */
export function comparerLignes(a: LigneResultat, b: LigneResultat): number {
  return (
    RANG_STATUT[a.statut] - RANG_STATUT[b.statut] || (b.note ?? -1) - (a.note ?? -1) || comparerNoms(a, b)
  );
}
