import { describe, expect, it } from "vitest";
import {
  comparerLignes,
  comparerNoms,
  LIBELLES_STATUT_RESULTAT,
  mediane,
  moyenne,
  SEUIL_INDICE_ELEVE,
} from "./regles-resultats";
import type { LigneResultat } from "./vue-resultats";

function ligne(nom: string, statut: LigneResultat["statut"], note: number | null = null): LigneResultat {
  return {
    etudiantId: nom,
    nom,
    prenom: "A",
    tiersTemps: false,
    statut,
    participationId: null,
    passage: null,
    rattrapageLe: null,
    note,
    points: null,
    bonnes: null,
    dureeS: null,
    indice: null,
    rattrapagePrevu: null,
  };
}

describe("statistiques des résultats (D5)", () => {
  it("moyenne arrondie au centième, null sans valeur", () => {
    expect(moyenne([])).toBeNull();
    expect(moyenne([20, 0, 10])).toBe(10);
    expect(moyenne([14.5, 13])).toBe(13.75);
    expect(moyenne([1, 2, 2])).toBe(1.67);
  });

  it("médiane, moyenne des deux valeurs centrales pour un nombre pair", () => {
    expect(mediane([])).toBeNull();
    expect(mediane([3, 1, 2])).toBe(2);
    expect(mediane([20, 0, 10, 12])).toBe(11);
    expect(mediane([13, 14.5])).toBe(13.75);
  });

  it("fixe le seuil d'un indice élevé et les libellés", () => {
    expect(SEUIL_INDICE_ELEVE).toBe(60);
    expect(LIBELLES_STATUT_RESULTAT).toEqual({ present: "Présent", en_cours: "En cours", absent: "Absent" });
  });
});

describe("tri des lignes", () => {
  it("présents par note décroissante puis nom, en cours, absents par nom", () => {
    const lignes = [
      ligne("Roux", "absent"),
      ligne("Blanc", "en_cours"),
      ligne("Martin", "present", 12),
      ligne("André", "absent"),
      ligne("Dupont", "present", 15),
      ligne("Clément", "present", 12),
    ];
    expect(lignes.sort(comparerLignes).map((l) => l.nom)).toEqual([
      "Dupont",
      "Clément",
      "Martin",
      "Blanc",
      "André",
      "Roux",
    ]);
  });

  it("exports : par nom seulement", () => {
    const lignes = [ligne("Roux", "present", 20), ligne("André", "absent"), ligne("Martin", "present", 2)];
    expect(lignes.sort(comparerNoms).map((l) => l.nom)).toEqual(["André", "Martin", "Roux"]);
  });
});
