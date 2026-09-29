import { describe, expect, it } from "vitest";
import { schemaContenuSession, schemaOrdre, type ContenuSession } from "./instantane";

const CLE_1 = "11111111-1111-4111-8111-111111111111";
const CLE_2 = "22222222-2222-4222-8222-222222222222";

function contenu(modifs: Partial<ContenuSession> = {}): ContenuSession {
  return {
    version: 1,
    titre: "Algorithmique — Contrôle 2",
    modeChrono: "global",
    dureeGlobaleS: 1200,
    questions: [
      {
        cle: CLE_1,
        type: "unique",
        enonce: "Qu’affiche ce programme ?",
        image: null,
        code: { libelle: "Python", lignes: [[{ texte: "print(4)", couleur: "#E9E6DF" }], []] },
        propositions: [
          { texte: "4", image: null, correcte: true },
          { texte: "16", image: null, correcte: false },
        ],
        pointsBonne: 1,
        pointsMauvaise: -0.25,
        pointsVide: 0,
        dureeS: null,
        lieeASuivante: false,
      },
      {
        cle: CLE_2,
        type: "vrai_faux",
        enonce: "Une pile suit l’ordre FIFO.",
        image: { id: "33333333-3333-4333-8333-333333333333", largeur: 800, hauteur: 600 },
        code: null,
        propositions: [
          { texte: "Vrai", image: null, correcte: false },
          { texte: "Faux", image: null, correcte: true },
        ],
        pointsBonne: 2,
        pointsMauvaise: 0,
        pointsVide: 0,
        dureeS: null,
        lieeASuivante: false,
      },
    ],
    ...modifs,
  };
}

describe("instantané d'une session", () => {
  it("accepte un instantané complet", () => {
    expect(schemaContenuSession.parse(contenu())).toEqual(contenu());
  });

  it("exige la durée globale en chrono global", () => {
    expect(schemaContenuSession.safeParse(contenu({ dureeGlobaleS: null })).success).toBe(false);
  });

  it("exige la durée de chaque question en chrono par question", () => {
    const base = contenu({ modeChrono: "par_question", dureeGlobaleS: null });
    expect(schemaContenuSession.safeParse(base).success).toBe(false);
    const complet = { ...base, questions: base.questions.map((q) => ({ ...q, dureeS: 30 })) };
    expect(schemaContenuSession.safeParse(complet).success).toBe(true);
  });

  it("refuse un champ inconnu, une version inconnue et un QCM sans question", () => {
    expect(schemaContenuSession.safeParse({ ...contenu(), secret: 1 }).success).toBe(false);
    expect(schemaContenuSession.safeParse({ ...contenu(), version: 2 }).success).toBe(false);
    expect(schemaContenuSession.safeParse(contenu({ questions: [] })).success).toBe(false);
  });

  it("refuse une clé de question qui n'est pas un identifiant", () => {
    const [premiere] = contenu().questions;
    if (!premiere) throw new Error("question absente");
    expect(schemaContenuSession.safeParse(contenu({ questions: [{ ...premiere, cle: "q1" }] })).success).toBe(
      false,
    );
  });
});

describe("ordre d'un étudiant", () => {
  it("accepte des index de questions et de propositions", () => {
    expect(
      schemaOrdre.parse([
        { q: 1, p: [1, 0] },
        { q: 0, p: [0, 1] },
      ]),
    ).toHaveLength(2);
  });

  it("refuse un ordre vide, un index négatif ou décimal", () => {
    expect(schemaOrdre.safeParse([]).success).toBe(false);
    expect(schemaOrdre.safeParse([{ q: -1, p: [0, 1] }]).success).toBe(false);
    expect(schemaOrdre.safeParse([{ q: 0.5, p: [0, 1] }]).success).toBe(false);
  });
});
