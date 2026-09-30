import { describe, expect, it } from "vitest";
import {
  celluleSynthese,
  comparerLignes,
  comparerNoms,
  EN_TETES_QUESTION,
  EN_TETES_SYNTHESE,
  LIBELLES_STATUT_RESULTAT,
  lettre,
  mediane,
  MENTION_RAPPORT,
  moyenne,
  nomFichierExport,
  resultatQuestion,
  SEUIL_INDICE_ELEVE,
  TEXTES_CHRONOLOGIE,
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

describe("exports (D8)", () => {
  it("fixe les en-têtes de la synthèse et des feuilles de questions", () => {
    expect(EN_TETES_SYNTHESE).toEqual([
      "Nom",
      "Prénom",
      "Tiers-temps",
      "Passage",
      "Statut",
      "Note sur 20",
      "Points",
      "Bonnes réponses",
      "Durée (s)",
      "Indice de suspicion",
    ]);
    expect(EN_TETES_QUESTION).toEqual(["Nom", "Prénom", "Réponse", "Résultat", "Points"]);
  });

  it("nomme le fichier d'après le titre sans accents et la date de Paris", () => {
    const le = new Date("2026-09-28T22:30:00.000Z");
    expect(nomFichierExport("Algorithmique — Contrôle 2", le, "csv")).toBe(
      "resultats-algorithmique-controle-2-2026-09-29.csv",
    );
    expect(nomFichierExport("  ***  ", le, "xlsx")).toBe("resultats-2026-09-29.xlsx");
    expect(nomFichierExport("a".repeat(80), le, "xlsx")).toBe(`resultats-${"a".repeat(60)}-2026-09-29.xlsx`);
  });

  it("lettre les réponses et juge une sélection", () => {
    expect([0, 1, 7].map(lettre)).toEqual(["A", "B", "H"]);
    const question = { propositions: [{ correcte: true }, { correcte: false }, { correcte: true }] };
    expect(resultatQuestion([], question)).toBe("Sans réponse");
    expect(resultatQuestion([0, 2], question)).toBe("Juste");
    expect(resultatQuestion([2, 0], question)).toBe("Juste");
    expect(resultatQuestion([0], question)).toBe("Faux");
    expect(resultatQuestion([0, 1, 2], question)).toBe("Faux");
  });

  it("met une ligne du tableau dans l'ordre des en-têtes", () => {
    expect(
      celluleSynthese({
        ...ligne("Dupont", "present", 14.5),
        prenom: "Léa",
        tiersTemps: true,
        passage: "rattrapage",
        points: 2.9,
        bonnes: 3,
        dureeS: 842,
        indice: 12,
      }),
    ).toEqual(["Dupont", "Léa", "Oui", "Rattrapage", "Présent", 14.5, 2.9, 3, 842, 12]);
    expect(celluleSynthese(ligne("Roux", "absent"))).toEqual([
      "Roux",
      "A",
      "Non",
      null,
      "Absent",
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

describe("textes du rapport (D9, D10)", () => {
  it("rappelle que l'indice n'est pas une preuve, et fixe les textes de la chronologie", () => {
    expect(MENTION_RAPPORT).toBe(
      "L’indice est une estimation calculée à partir des événements enregistrés. Ce n’est pas une preuve : à croiser avec ce que tu as observé en salle.",
    );
    expect(TEXTES_CHRONOLOGIE.debut).toBe("Début de l’examen");
    expect(TEXTES_CHRONOLOGIE.fin(18, 20)).toBe("Fin · 18 réponses sur 20");
    expect(TEXTES_CHRONOLOGIE.fin(1, 2)).toBe("Fin · 1 réponse sur 2");
    expect(TEXTES_CHRONOLOGIE.reponseRapide(7)).toBe("Réponse validée 7 s après le retour");
  });
});
