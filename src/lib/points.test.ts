import { describe, expect, it } from "vitest";
import {
  formaterNote,
  formaterPoints,
  libellePoints,
  lirePoints,
  MESSAGE_POINTS_NOMBRE,
  problemePoints,
} from "./points";

const MOINS = String.fromCharCode(0x2212);

describe("lirePoints", () => {
  it.each([
    ["1", 1],
    ["+1", 1],
    ["-0,25", -0.25],
    [`${MOINS}0,25`, -0.25],
    ["0.5", 0.5],
    [" 2 ", 2],
    [",5", 0.5],
    ["-1,", -1],
  ])("lit « %s »", (texte, attendu) => {
    expect(lirePoints(texte)).toBe(attendu);
  });

  it.each(["", "abc", "1,2,3", "--1", "1e3", "+", "0x10"])("refuse « %s »", (texte) => {
    expect(lirePoints(texte)).toBeNull();
  });
});

describe("problemePoints", () => {
  it.each([
    [0.01, "bonne"],
    [1, "bonne"],
    [100, "bonne"],
    [0, "mauvaise"],
    [-0.25, "mauvaise"],
    [-100, "mauvaise"],
    [0, "vide"],
    [-1, "vide"],
    [0.29, "bonne"],
  ] as const)("accepte %s pour « %s »", (valeur, sorte) => {
    expect(problemePoints(valeur, sorte)).toBeNull();
  });

  it.each([0, -1, 100.01])("refuse %s pour une bonne réponse", (valeur) => {
    expect(problemePoints(valeur, "bonne")).toBe("Les points d'une bonne réponse vont de 0,01 à 100.");
  });

  it.each([0.5, -100.5])("refuse %s pour une mauvaise réponse", (valeur) => {
    expect(problemePoints(valeur, "mauvaise")).toBe(
      `Les points d'une mauvaise réponse vont de ${MOINS}100 à 0.`,
    );
  });

  it("refuse des points positifs sans réponse", () => {
    expect(problemePoints(1, "vide")).toBe(`Les points sans réponse vont de ${MOINS}100 à 0.`);
  });

  it("refuse plus de deux décimales", () => {
    expect(problemePoints(0.125, "bonne")).toBe("Deux décimales au plus.");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])("refuse %s", (valeur) => {
    expect(problemePoints(valeur, "bonne")).toBe(MESSAGE_POINTS_NOMBRE);
  });
});

describe("formaterPoints", () => {
  it.each([
    [1, "+1"],
    [2.5, "+2,5"],
    [0.5, "+0,5"],
    [-0.25, `${MOINS}0,25`],
    [0, "0"],
    [-0, "0"],
  ])("affiche %s en « %s »", (valeur, attendu) => {
    expect(formaterPoints(valeur)).toBe(attendu);
  });

  it("relit ce qu'elle affiche", () => {
    for (const valeur of [1, -0.25, 0, 12.5]) expect(lirePoints(formaterPoints(valeur))).toBe(valeur);
  });
});

describe("libellePoints", () => {
  it.each([
    [1, "1 pt"],
    [0.5, "0,5 pt"],
    [1.5, "1,5 pt"],
    [2, "2 pts"],
    [-0.25, `${MOINS}0,25 pt`],
  ])("affiche %s en « %s »", (valeur, attendu) => {
    expect(libellePoints(valeur)).toBe(attendu);
  });
});

describe("formaterNote", () => {
  it("affiche la note avec une virgule, sans zéro inutile (spec §6.6)", () => {
    expect(formaterNote(14.5)).toBe("14,5");
    expect(formaterNote(6.67)).toBe("6,67");
    expect(formaterNote(20)).toBe("20");
    expect(formaterNote(0)).toBe("0");
  });
});
