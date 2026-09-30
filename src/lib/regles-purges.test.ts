import { describe, expect, it } from "vitest";
import {
  AGE_LIMITEUR_S,
  CONSERVATION_INVITATIONS_CLOSES_JOURS,
  CONSERVATION_JOURNAL_MOIS,
  DELAI_GRACE_IMAGES_MS,
  ETAPES_PURGE,
  statutBilan,
} from "./regles-purges";

describe("règles des purges (décisions D1 à D4 du plan du lot 10)", () => {
  it("fixe les durées techniques", () => {
    expect(DELAI_GRACE_IMAGES_MS).toBe(24 * 60 * 60 * 1000);
    expect(CONSERVATION_JOURNAL_MOIS).toBe(12);
    expect(CONSERVATION_INVITATIONS_CLOSES_JOURS).toBe(30);
    expect(AGE_LIMITEUR_S).toBe(24 * 60 * 60);
  });

  it("enchaîne les étapes dans l'ordre, le journal en dernier", () => {
    expect(ETAPES_PURGE).toEqual([
      "evenements",
      "sessions",
      "images",
      "connexions",
      "jetons",
      "invitations",
      "limiteur",
      "journal",
    ]);
  });

  it("répond 500 seulement si toutes les étapes ont échoué", () => {
    expect(statutBilan({ erreurs: [] })).toBe(200);
    expect(statutBilan({ erreurs: ["images"] })).toBe(200);
    expect(statutBilan({ erreurs: [...ETAPES_PURGE] })).toBe(500);
  });
});
