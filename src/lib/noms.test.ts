import { describe, expect, it } from "vitest";
import { cleEtudiant, correspondANom, normaliserNom } from "./noms";

describe("normaliserNom", () => {
  it.each([
    ["Élodie", "elodie"],
    ["DUPRÉ", "dupre"],
    ["Jean-Pierre", "jean pierre"],
    ["D'Arc", "d arc"],
    ["O’Neil", "o neil"],
    ["  Le   Goff  ", "le goff"],
    ["Cœur", "coeur"],
    ["LÆTITIA", "laetitia"],
    ["Ñúñez", "nunez"],
    ["Çelik", "celik"],
    ["Nguyễn", "nguyen"],
    ["Marie\tClaire\nB", "marie claire b"],
    ["Anne–Sophie", "anne sophie"],
    ["-", ""],
    ["’", ""],
    ["", ""],
    ["O\u2018Neil", "o neil"],
    ["D\u00b4Arc", "d arc"],
    ["Jean\u00adPierre", "jeanpierre"],
    ["L\u200be\u0301a", "lea"],
  ])("« %s » → « %s »", (entree, attendu) => {
    expect(normaliserNom(entree)).toBe(attendu);
  });
});

describe("cleEtudiant", () => {
  it("ignore casse, accents, tirets et espaces", () => {
    expect(cleEtudiant("DUPONT", "Léa")).toBe(cleEtudiant("  dupont ", "LEA"));
    expect(cleEtudiant("Martin-Durand", "Inès")).toBe(cleEtudiant("martin durand", "ines"));
  });

  it("distingue nom et prénom", () => {
    expect(cleEtudiant("Léa", "Dupont")).not.toBe(cleEtudiant("Dupont", "Léa"));
  });

  it("ignore les caractères invisibles", () => {
    expect(cleEtudiant("Du\u200bpont", "Léa")).toBe(cleEtudiant("Dupont", "Lea"));
  });

  it("neutralise le séparateur « | » : pas de collision entre nom et prénom", () => {
    expect(cleEtudiant("a|b", "c")).not.toBe(cleEtudiant("a", "b|c"));
  });
});

describe("correspondANom", () => {
  it("accepte le début du nom, du prénom ou des deux dans les deux ordres", () => {
    expect(correspondANom("dup", "DUPONT", "Léa")).toBe(true);
    expect(correspondANom("LÉ", "DUPONT", "Léa")).toBe(true);
    expect(correspondANom("lea dup", "DUPONT", "Léa")).toBe(true);
    expect(correspondANom("dupont l", "DUPONT", "Léa")).toBe(true);
  });

  it("refuse une saisie qui ne commence ni le nom ni le prénom", () => {
    expect(correspondANom("pont", "DUPONT", "Léa")).toBe(false);
  });

  it("une saisie vide ou sans lettre correspond à tout le monde", () => {
    expect(correspondANom("", "DUPONT", "Léa")).toBe(true);
    expect(correspondANom(" - ", "DUPONT", "Léa")).toBe(true);
  });
});
