import { describe, expect, it } from "vitest";
import { geometrieEvolution, GRAPHIQUE_EVOLUTION } from "./evolution";

describe("geometrieEvolution (D9)", () => {
  it("place la note en ligne et l'indice en barres, orange foncé à 60 et plus", () => {
    const { points, chemin } = geometrieEvolution([
      { note: 14, indice: 4, le: "2026-09-14T08:00:00.000Z" },
      { note: 11, indice: 62, le: "2026-09-28T08:00:00.000Z" },
    ]);
    expect(GRAPHIQUE_EVOLUTION).toMatchObject({ largeur: 400, hauteur: 220, bas: 180, haut: 20 });
    expect(points).toEqual([
      { x: 112.5, yNote: 68, barre: { x: 98.5, y: 173.6, hauteur: 6.4, fort: false }, etiquette: "14 sept." },
      { x: 297.5, yNote: 92, barre: { x: 283.5, y: 80.8, hauteur: 99.2, fort: true }, etiquette: "28 sept." },
    ]);
    expect(chemin).toBe("M112.5 68L297.5 92");
  });

  it("sans indice : pas de barre ; sans examen : rien", () => {
    expect(
      geometrieEvolution([{ note: 20, indice: null, le: "2026-09-14T08:00:00.000Z" }]).points[0]?.barre,
    ).toBeNull();
    expect(geometrieEvolution([])).toEqual({ points: [], chemin: "" });
  });
});
