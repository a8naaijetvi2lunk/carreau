import { describe, expect, it } from "vitest";
import { decalageServeurMs, secondesAvant } from "./horloge-serveur";

describe("heure du serveur vue du navigateur", () => {
  it("mesure le décalage de l'horloge du serveur", () => {
    expect(decalageServeurMs("2026-09-21T14:13:20.000Z", 1_790_000_000_000 - 1500)).toBe(1500);
    expect(decalageServeurMs("2026-09-21T14:13:20.000Z", 1_790_000_000_000 + 250)).toBe(-250);
    expect(decalageServeurMs("pas une date", 1_790_000_000_000)).toBe(0);
  });

  it("compte les secondes entières restantes, jamais sous zéro", () => {
    const cible = "2026-09-21T14:13:25.000Z";
    const local = 1_790_000_000_000;
    expect(secondesAvant(cible, 0, local)).toBe(5);
    expect(secondesAvant(cible, 0, local + 999)).toBe(5);
    expect(secondesAvant(cible, 0, local + 1000)).toBe(4);
    expect(secondesAvant(cible, 2000, local)).toBe(3);
    expect(secondesAvant(cible, 0, local + 4999)).toBe(1);
    expect(secondesAvant(cible, 0, local + 5000)).toBe(0);
    expect(secondesAvant(cible, 0, local + 60_000)).toBe(0);
    expect(secondesAvant("pas une date", 0, local)).toBe(0);
  });
});
