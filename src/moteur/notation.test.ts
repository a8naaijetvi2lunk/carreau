import { describe, expect, it } from "vitest";
import { noter, pointsQuestion, type QuestionNotee } from "./notation";

function q(type: QuestionNotee["type"], correctes: boolean[]): QuestionNotee {
  return {
    type,
    propositions: correctes.map((correcte) => ({ correcte })),
    pointsBonne: 2,
    pointsMauvaise: -0.5,
    pointsVide: -0.25,
  };
}

describe("points d'une question (spec §6.6)", () => {
  it("choix unique et vrai/faux : bonne, autre ou aucune", () => {
    const unique = q("unique", [false, true, false]);
    expect(pointsQuestion(unique, [1])).toBe(2);
    expect(pointsQuestion(unique, [0])).toBe(-0.5);
    expect(pointsQuestion(unique, [])).toBe(-0.25);
    const vraiFaux = q("vrai_faux", [false, true]);
    expect(pointsQuestion(vraiFaux, [1])).toBe(2);
    expect(pointsQuestion(vraiFaux, [0])).toBe(-0.5);
  });

  it("choix multiples en tout ou rien", () => {
    const multiple = q("multiple", [true, false, true, false]);
    expect(pointsQuestion(multiple, [2, 0])).toBe(2);
    expect(pointsQuestion(multiple, [0])).toBe(-0.5);
    expect(pointsQuestion(multiple, [0, 1, 2])).toBe(-0.5);
    expect(pointsQuestion(multiple, [1, 3])).toBe(-0.5);
    expect(pointsQuestion(multiple, [])).toBe(-0.25);
  });

  it("compte une réponse cochée deux fois une seule fois", () => {
    expect(pointsQuestion(q("unique", [true, false]), [0, 0])).toBe(2);
  });
});

describe("note sur 20", () => {
  it("ramène le total sur 20 et l'arrondit au centième", () => {
    expect(noter([1, 1, 0], 3)).toEqual({ total: 2, note: 13.33 });
    expect(noter([1, 0, 0], 3)).toEqual({ total: 1, note: 6.67 });
    expect(noter([14.5, 0], 20)).toEqual({ total: 14.5, note: 14.5 });
    expect(noter([2, 2], 4)).toEqual({ total: 4, note: 20 });
  });

  it("additionne en centièmes, sans erreur d'arrondi binaire", () => {
    expect(noter([0.1, 0.2], 0.3)).toEqual({ total: 0.3, note: 20 });
  });

  it("borne le total à 0", () => {
    expect(noter([-0.5, -0.25, 0], 3)).toEqual({ total: 0, note: 0 });
    expect(noter([], 3)).toEqual({ total: 0, note: 0 });
  });

  it("refuse un barème nul", () => {
    expect(() => noter([1], 0)).toThrow("Barème nul");
  });
});
