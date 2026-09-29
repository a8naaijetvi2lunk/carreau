import { describe, expect, it } from "vitest";
import { titreQuestion } from "./libelles";

const EMOJI = String.fromCodePoint(0x1f600);

describe("titreQuestion", () => {
  it("prend la première ligne non vide de l'énoncé", () => {
    expect(titreQuestion("\n  Quelle est la capitale ?  \nSuite")).toBe("Quelle est la capitale ?");
  });

  it("annonce une question sans énoncé", () => {
    expect(titreQuestion("  \n ")).toBe("Question sans énoncé");
  });

  it("coupe à 80 caractères sans jamais couper un émoji en deux", () => {
    const titre = titreQuestion(`${"a".repeat(78)}${EMOJI}${"b".repeat(10)}`);
    expect(titre).toBe(`${"a".repeat(78)}${EMOJI}…`);
    expect(Array.from(titre)).toHaveLength(80);
  });
});
