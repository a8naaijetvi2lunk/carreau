import { describe, expect, it } from "vitest";
import { codeSortie } from "./purger.mjs";

describe("codeSortie de scripts/purger.mjs (décision D6 du plan du lot 10)", () => {
  it("vaut 0 seulement pour un 2xx sans étape en erreur", () => {
    expect(codeSortie(200, JSON.stringify({ erreurs: [] }))).toBe(0);
    expect(codeSortie(200, JSON.stringify({ erreurs: ["images"] }))).toBe(1);
    expect(codeSortie(500, JSON.stringify({ erreurs: [] }))).toBe(1);
    expect(codeSortie(401, JSON.stringify({ erreur: { code: "NON_CONNECTE" } }))).toBe(1);
    expect(codeSortie(200, "pas du JSON")).toBe(1);
    expect(codeSortie(200, JSON.stringify({}))).toBe(1);
  });
});
