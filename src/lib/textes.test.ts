import { describe, expect, it } from "vitest";
import { formaterChrono, formaterDuree, pluriel } from "./textes";

describe("pluriel", () => {
  it.each([
    [0, "0 question"],
    [1, "1 question"],
    [2, "2 questions"],
  ])("%i → « %s »", (n, attendu) => {
    expect(pluriel(n, "question", "questions")).toBe(attendu);
  });
});

describe("formaterDuree", () => {
  it.each([
    [45, "45 s"],
    [90, "1 min 30 s"],
    [1200, "20 min"],
    [3600, "1 h"],
    [3900, "1 h 05"],
    [18000, "5 h"],
  ])("%i s → « %s »", (secondes, attendu) => {
    expect(formaterDuree(secondes)).toBe(attendu);
  });
});

describe("formaterChrono", () => {
  it.each([
    [45, "00:45"],
    [1200, "20:00"],
    [485, "08:05"],
    [5400, "1:30:00"],
  ])("%i s → « %s »", (secondes, attendu) => {
    expect(formaterChrono(secondes)).toBe(attendu);
  });
});
