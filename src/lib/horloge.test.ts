import { afterEach, describe, expect, it } from "vitest";
import { definirHorlogePourLesTests, horlogeFixe, maintenant } from "./horloge";

// Valeurs réalistes (≈ 1,7 × 10¹²) : une horloge de test à 0 ou à 10⁶ masque des erreurs de précision.
const RENTREE = Date.UTC(2026, 8, 28, 8, 30, 0);

describe("horloge", () => {
  afterEach(() => definirHorlogePourLesTests());

  it("donne l'heure système par défaut", () => {
    const avant = Date.now();
    const instant = maintenant().getTime();
    expect(instant).toBeGreaterThanOrEqual(avant);
    expect(instant - avant).toBeLessThan(1000);
  });

  it("se fige, s'avance et se replace à la main", () => {
    const horloge = horlogeFixe(RENTREE);
    definirHorlogePourLesTests(horloge);
    expect(maintenant().getTime()).toBe(RENTREE);
    horloge.avancer(30_000);
    expect(maintenant().toISOString()).toBe("2026-09-28T08:30:30.000Z");
    horloge.fixer(new Date(RENTREE));
    expect(maintenant().getTime()).toBe(RENTREE);
  });

  it("accepte une date de départ", () => {
    definirHorlogePourLesTests(horlogeFixe(new Date(RENTREE)));
    expect(maintenant().getTime()).toBe(RENTREE);
  });

  it("renvoie une nouvelle Date à chaque appel", () => {
    definirHorlogePourLesTests(horlogeFixe(RENTREE));
    maintenant().setTime(0);
    expect(maintenant().getTime()).toBe(RENTREE);
  });
});
