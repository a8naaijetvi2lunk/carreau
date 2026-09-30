import { describe, expect, it } from "vitest";
import {
  dateDepuisHeureDeParis,
  formaterDateCourte,
  formaterDateHeure,
  formaterHeure,
  formaterHeureSecondes,
  formaterJour,
  formaterJourCourt,
  saisieHeureDeParis,
} from "./dates";

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

describe("formaterHeureSecondes", () => {
  it("affiche l'heure de Paris à la seconde", () => {
    expect(formaterHeureSecondes(new Date("2026-09-29T08:42:13.400Z"))).toBe("10:42:13");
  });
});

describe("formaterJour et formaterJourCourt", () => {
  it("donne le jour de Paris en toutes lettres et en abrégé", () => {
    const date = new Date("2026-09-28T22:30:00.000Z");
    expect(formaterJour(date)).toBe("mardi 29 septembre 2026");
    expect(formaterJourCourt(date)).toBe("29 sept.");
  });
});

describe("heure de Paris saisie dans un champ datetime-local", () => {
  it("lit une heure d'été et une heure d'hiver", () => {
    expect(dateDepuisHeureDeParis("2026-09-30T08:30")?.toISOString()).toBe("2026-09-30T06:30:00.000Z");
    expect(dateDepuisHeureDeParis("2026-12-01T09:05")?.toISOString()).toBe("2026-12-01T08:05:00.000Z");
    expect(dateDepuisHeureDeParis("2027-01-01T00:00")?.toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });

  it("refuse l'heure qui n'existe pas au passage à l'heure d'été", () => {
    expect(dateDepuisHeureDeParis("2026-03-29T02:30")).toBeNull();
    expect(dateDepuisHeureDeParis("2026-03-29T03:30")?.toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("prend la seconde occurrence d'une heure répétée au passage à l'heure d'hiver", () => {
    expect(dateDepuisHeureDeParis("2026-10-25T02:30")?.toISOString()).toBe("2026-10-25T01:30:00.000Z");
  });

  it("refuse une saisie mal formée ou une date impossible", () => {
    for (const saisie of [
      "",
      "2026-9-30T08:30",
      "2026-09-30 08:30",
      "2026-02-31T10:00",
      "2026-09-30T24:00",
    ]) {
      expect(dateDepuisHeureDeParis(saisie)).toBeNull();
    }
  });

  it("écrit un instant en heure de Paris, à la minute", () => {
    expect(saisieHeureDeParis(new Date("2026-09-30T06:30:59.000Z"))).toBe("2026-09-30T08:30");
    expect(saisieHeureDeParis(new Date("2026-12-31T23:00:00.000Z"))).toBe("2027-01-01T00:00");
  });
});
