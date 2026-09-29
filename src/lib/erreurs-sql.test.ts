import { describe, expect, it } from "vitest";
import { estViolationUnicite } from "./erreurs-sql";

describe("estViolationUnicite", () => {
  it("reconnaît le SQLSTATE 23505, directement ou dans la cause (erreur Drizzle)", () => {
    expect(estViolationUnicite({ code: "23505" })).toBe(true);
    expect(estViolationUnicite({ query: "INSERT", cause: { code: "23505", constraint: "x" } })).toBe(true);
  });

  it("filtre sur la contrainte quand elle est donnée", () => {
    const erreur = { cause: { code: "23505", constraint: "utilisateur_email_unique" } };
    expect(estViolationUnicite(erreur, "utilisateur_email_unique")).toBe(true);
    expect(estViolationUnicite(erreur, "autre")).toBe(false);
  });

  it("ignore les autres erreurs", () => {
    expect(estViolationUnicite({ code: "23514" })).toBe(false);
    expect(estViolationUnicite(new Error("x"))).toBe(false);
    expect(estViolationUnicite(null)).toBe(false);
    expect(estViolationUnicite("23505")).toBe(false);
  });
});
