import { describe, expect, it } from "vitest";
import {
  DELAI_CLOTURE_MS,
  MESSAGES_EXAMEN,
  ORIGINES_REPONSE,
  PERIODE_EXAMEN_MS,
  TOLERANCE_ECHEANCE_MS,
} from "./regles-examen";

describe("règles de l'examen", () => {
  it("fixe les valeurs du spec (§6.5 et §7)", () => {
    expect(ORIGINES_REPONSE).toEqual(["validation", "echeance", "fin"]);
    expect(TOLERANCE_ECHEANCE_MS).toBe(3_000);
    expect(DELAI_CLOTURE_MS).toBe(600_000);
    expect(PERIODE_EXAMEN_MS).toBe(5_000);
  });

  it("garde un vocabulaire non accusateur", () => {
    for (const message of Object.values(MESSAGES_EXAMEN)) {
      expect(message).not.toMatch(/surveill|suspici|triche|fraude/i);
    }
  });
});
