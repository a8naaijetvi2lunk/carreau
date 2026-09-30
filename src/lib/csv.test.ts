import { describe, expect, it } from "vitest";
import { celluleCsv, octetsCsv } from "./csv";

describe("celluleCsv (D8)", () => {
  it("neutralise un texte qui commencerait une formule de tableur", () => {
    expect(celluleCsv("=1+1")).toBe("'=1+1");
    expect(celluleCsv("+33 6")).toBe("'+33 6");
    expect(celluleCsv("-2+3")).toBe("'-2+3");
    expect(celluleCsv("@SOMME(A1)")).toBe("'@SOMME(A1)");
    expect(celluleCsv("\tDupont")).toBe("'\tDupont");
    expect(celluleCsv("\rDupont")).toBe('"\'\rDupont"');
    expect(celluleCsv('=LIEN("x";"y")')).toBe('"\'=LIEN(""x"";""y"")"');
  });

  it("garde un texte ordinaire, met entre guillemets « ; », guillemets et sauts de ligne", () => {
    expect(celluleCsv("Dupont")).toBe("Dupont");
    expect(celluleCsv("D'Arc")).toBe("D'Arc");
    expect(celluleCsv("a;b")).toBe('"a;b"');
    expect(celluleCsv('dit "non"')).toBe('"dit ""non"""');
    expect(celluleCsv("deux\nlignes")).toBe('"deux\nlignes"');
    expect(celluleCsv("")).toBe("");
  });

  it("écrit un nombre avec une virgule, jamais préfixé, et une cellule vide pour null", () => {
    expect(celluleCsv(14.5)).toBe("14,5");
    expect(celluleCsv(-0.25)).toBe("-0,25");
    expect(celluleCsv(20)).toBe("20");
    expect(celluleCsv(null)).toBe("");
  });
});

describe("octetsCsv", () => {
  it("commence par le BOM UTF-8, sépare par « ; » et termine chaque ligne par CRLF", () => {
    const octets = octetsCsv([
      ["Nom", "Note sur 20"],
      ["Dupré", 13.75],
    ]);
    expect([...octets.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(octets.slice(3))).toBe("Nom;Note sur 20\r\nDupré;13,75\r\n");
  });
});
