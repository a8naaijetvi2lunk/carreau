import { describe, expect, it } from "vitest";
import { chronologie, type ReponseDatee } from "./chronologie";
import type { Consolidation } from "./indice";

const T = 1_790_000_000_000;

function a(secondes: number): Date {
  return new Date(T + secondes * 1000);
}

const VIDE: Consolidation = {
  sorties: [],
  coupures: [],
  focus: [],
  pressePapiers: [],
  ecranPartage: [],
  secondAppareil: [],
  rechargements: [],
  reprisesAutorisees: [],
  changementsAppareil: [],
};

function passage(consolidation: Partial<Consolidation>, reponses: ReponseDatee[] = [], repondues = 18) {
  return chronologie({
    demarreLe: a(0),
    termineeLe: a(600),
    consolidation: { ...VIDE, ...consolidation },
    reponses,
    repondues,
    total: 20,
  });
}

describe("chronologie (D10)", () => {
  it("raconte le passage dans l'ordre, du début à la fin", () => {
    const entrees = passage(
      {
        sorties: [{ debut: a(100), fin: a(138), dureeMs: 38_000, questionIndex: 6 }],
        focus: [
          { debut: a(50), fin: a(53), dureeMs: 3_000, questionIndex: 3 },
          { debut: a(60), fin: a(61), dureeMs: 1_500, questionIndex: 3 },
        ],
        pressePapiers: [{ le: a(200), questionIndex: 8 }],
      },
      [
        { index: 6, le: a(145), origine: "validation" },
        { index: 7, le: a(300), origine: "validation" },
        { index: 8, le: a(400), origine: "echeance" },
        { index: 9, le: a(600), origine: "fin" },
      ],
    );
    expect(entrees).toEqual([
      { le: a(0), index: null, texte: "Début de l’examen", dureeMs: null, sorte: "repere" },
      { le: a(50), index: 3, texte: "Perte de focus", dureeMs: 3_000, sorte: "mineur" },
      { le: a(100), index: 6, texte: "Sortie de l’application", dureeMs: 38_000, sorte: "notable" },
      { le: a(138), index: 6, texte: "Retour dans l’examen", dureeMs: null, sorte: "mineur" },
      { le: a(145), index: 6, texte: "Réponse validée 7 s après le retour", dureeMs: null, sorte: "notable" },
      { le: a(200), index: 8, texte: "Copier-coller", dureeMs: null, sorte: "notable" },
      { le: a(300), index: 7, texte: "Réponse validée", dureeMs: null, sorte: "mineur" },
      {
        le: a(400),
        index: 8,
        texte: "Temps écoulé : dernière sélection enregistrée",
        dureeMs: null,
        sorte: "mineur",
      },
      { le: a(600), index: null, texte: "Fin · 18 réponses sur 20", dureeMs: null, sorte: "repere" },
    ]);
  });

  it("liste coupures, écran partagé, second appareil et rechargements", () => {
    const entrees = passage({
      coupures: [{ debut: a(10), fin: a(40), dureeMs: 30_000, questionIndex: 1 }],
      ecranPartage: [{ le: a(20), questionIndex: 1 }],
      secondAppareil: [{ le: a(30), questionIndex: null }],
      rechargements: [{ le: a(45), questionIndex: 2 }],
      reprisesAutorisees: [{ le: a(50), questionIndex: 2 }],
      changementsAppareil: [{ debut: a(46), fin: a(60), dureeMs: 14_000, questionIndex: 2 }],
    });
    expect(entrees.slice(1, -1).map((e) => [e.texte, e.sorte, e.dureeMs])).toEqual([
      ["Coupure réseau (non comptée)", "mineur", 30_000],
      ["Écran partagé (heuristique)", "notable", null],
      ["Tentative depuis un second appareil", "notable", null],
      ["Rechargement de la page", "mineur", null],
      ["Sans téléphone pendant le changement autorisé (non compté)", "mineur", 14_000],
      ["Changement de téléphone autorisé", "mineur", null],
    ]);
  });

  it("à heure égale : début d'abord, fin en dernier, sinon l'ordre d'ajout", () => {
    const entrees = passage({
      secondAppareil: [{ le: a(0), questionIndex: null }],
      sorties: [{ debut: a(580), fin: a(600), dureeMs: 20_000, questionIndex: 19 }],
    });
    expect(entrees.map((e) => e.texte)).toEqual([
      "Début de l’examen",
      "Tentative depuis un second appareil",
      "Sortie de l’application",
      "Retour dans l’examen",
      "Fin · 18 réponses sur 20",
    ]);
  });

  it("une réponse rapide suit une sortie d'au moins 5 s, dans les 10 s de son retour, bornes comprises", () => {
    const sorties = [
      { debut: a(100), fin: a(110), dureeMs: 10_000, questionIndex: 1 },
      { debut: a(200), fin: a(204), dureeMs: 4_000, questionIndex: 2 },
    ];
    const reponses: ReponseDatee[] = [
      { index: 1, le: a(110), origine: "validation" },
      { index: 1, le: a(120), origine: "validation" },
      { index: 1, le: a(121), origine: "validation" },
      { index: 2, le: a(205), origine: "validation" },
    ];
    expect(
      passage({ sorties }, reponses)
        .filter((e) => e.texte.startsWith("Réponse"))
        .map((e) => e.texte),
    ).toEqual([
      "Réponse validée 0 s après le retour",
      "Réponse validée 10 s après le retour",
      "Réponse validée",
      "Réponse validée",
    ]);
  });
});
