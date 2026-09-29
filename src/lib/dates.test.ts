import { describe, expect, it } from "vitest";
import { formaterDateCourte, formaterDateHeure, formaterHeure } from "./dates";

describe("dates (heure de Paris)", () => {
  it("formate une date d'été en toutes lettres et en abrégé", () => {
    const date = new Date("2026-09-29T08:05:00.000Z");
    expect(formaterDateHeure(date)).toBe("29 septembre 2026 à 10:05");
    expect(formaterDateCourte(date)).toBe("29/09/2026 10:05");
  });

  it("applique l'heure d'hiver", () => {
    expect(formaterDateCourte(new Date("2026-12-01T08:05:00.000Z"))).toBe("01/12/2026 09:05");
  });
});

describe("formaterHeure", () => {
  it("affiche l'heure de Paris sur deux chiffres", () => {
    expect(formaterHeure(new Date("2026-09-29T08:05:00.000Z"))).toBe("10:05");
    expect(formaterHeure(new Date("2026-12-01T08:05:00.000Z"))).toBe("09:05");
  });
});
