import { describe, expect, it } from "vitest";
import { calculerOrdre, melanger, type Tirage } from "./melange";

/** Tirage toujours nul : chaque élément est échangé avec le premier. */
const zero: Tirage = () => 0;
/** Tirage maximal : chaque élément reste à sa place. */
const identite: Tirage = (n) => n - 1;
const aleatoire: Tirage = (n) => Math.floor(Math.random() * n);

function question(lieeASuivante = false, propositions = 2) {
  return { lieeASuivante, propositions: Array.from({ length: propositions }, () => ({})) };
}

describe("melanger", () => {
  it("conserve l'ordre quand chaque tirage désigne l'élément courant", () => {
    expect(melanger(["a", "b", "c", "d"], identite)).toEqual(["a", "b", "c", "d"]);
  });

  it("applique Fisher-Yates de la fin vers le début", () => {
    expect(melanger(["a", "b", "c", "d"], zero)).toEqual(["b", "c", "d", "a"]);
  });

  it("laisse la liste d'origine intacte et accepte zéro ou un élément", () => {
    const origine = ["a", "b"];
    melanger(origine, zero);
    expect(origine).toEqual(["a", "b"]);
    expect(melanger([], zero)).toEqual([]);
    expect(melanger(["seul"], zero)).toEqual(["seul"]);
  });

  it("refuse un tirage hors bornes ou décimal", () => {
    expect(() => melanger(["a", "b"], () => 2)).toThrow("Tirage hors bornes");
    expect(() => melanger(["a", "b"], () => -1)).toThrow("Tirage hors bornes");
    expect(() => melanger(["a", "b"], () => 0.5)).toThrow("Tirage hors bornes");
  });

  it("donne toujours une permutation avec un vrai tirage", () => {
    for (let i = 0; i < 50; i += 1) {
      expect([...melanger([0, 1, 2, 3, 4, 5], aleatoire)].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });
});

describe("calculerOrdre", () => {
  it("garde l'ordre du QCM avec des tirages neutres", () => {
    expect(calculerOrdre([question(), question(), question(false, 3)], identite)).toEqual([
      { q: 0, p: [0, 1] },
      { q: 1, p: [0, 1] },
      { q: 2, p: [0, 1, 2] },
    ]);
  });

  it("mélange les blocs, garde l'ordre interne d'un bloc et mélange les réponses", () => {
    // Blocs : [0, 1], [2], [3, 4] ; un tirage nul donne [2], [3, 4], [0, 1].
    const ordre = calculerOrdre(
      [question(true), question(), question(), question(true), question(false, 3)],
      zero,
    );
    expect(ordre.map((o) => o.q)).toEqual([2, 3, 4, 0, 1]);
    expect(ordre[0]?.p).toEqual([1, 0]);
    expect(ordre[2]?.p).toEqual([1, 2, 0]);
  });

  it("laisse toujours consécutives et dans l'ordre les questions liées", () => {
    const questions = [question(true), question(true), question(), question(), question(true), question()];
    for (let i = 0; i < 50; i += 1) {
      const ordre = calculerOrdre(questions, aleatoire).map((o) => o.q);
      const debut = ordre.indexOf(0);
      expect(ordre.slice(debut, debut + 3)).toEqual([0, 1, 2]);
      const suite = ordre.indexOf(4);
      expect(ordre[suite + 1]).toBe(5);
      expect([...ordre].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });

  it("donne à chaque question une permutation de ses réponses", () => {
    const ordre = calculerOrdre([question(false, 8), question(false, 2)], aleatoire);
    const huit = ordre.find((o) => o.q === 0);
    expect([...(huit?.p ?? [])].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
