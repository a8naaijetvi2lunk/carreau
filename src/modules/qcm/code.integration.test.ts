import { describe, expect, it } from "vitest";
import { CLES_LANGAGES } from "@/lib/regles-qcm";
import { colorerCode, COULEUR_TEXTE_CODE } from "./code";

/** Texte de chaque ligne, jetons recollés. */
function lignes(jetons: ReturnType<typeof colorerCode>): string[] {
  return jetons.map((ligne) => ligne.map((j) => j.texte).join(""));
}

describe("colorerCode", () => {
  it("colore un programme Python aux couleurs de la maquette, ligne par ligne", () => {
    const source = "def f(n):\n    return n * 2\n\nprint(f(4))";
    const jetons = colorerCode("python", source);
    expect(lignes(jetons)).toEqual(source.split("\n"));
    expect(jetons[0]?.[0]).toEqual({ texte: "def", couleur: "#8FB3FF" });
    expect(jetons[2]).toEqual([]);
    expect(jetons[3]?.find((j) => j.texte === "4")?.couleur).toBe("#F0B37E");
    expect(jetons[3]?.find((j) => j.texte === "print")?.couleur).toBe("#F2D58A");
  });

  it("rend du HTML comme du texte, sans jamais produire de balise", () => {
    const source = "<script>alert(1)</script>";
    expect(lignes(colorerCode("html", source))).toEqual([source]);
  });

  it("ne colore pas le texte brut", () => {
    expect(colorerCode("texte", "a < b\n\n<b>gras</b>")).toEqual([
      [{ texte: "a < b", couleur: COULEUR_TEXTE_CODE }],
      [],
      [{ texte: "<b>gras</b>", couleur: COULEUR_TEXTE_CODE }],
    ]);
  });

  it("unifie les retours à la ligne Windows", () => {
    expect(lignes(colorerCode("python", "a = 1\r\nb = 2"))).toEqual(["a = 1", "b = 2"]);
  });

  it.each(CLES_LANGAGES)("découpe sans erreur un extrait en %s", (langage) => {
    expect(lignes(colorerCode(langage, "x = 1"))).toEqual(["x = 1"]);
  });
});
