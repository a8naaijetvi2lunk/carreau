import { describe, expect, it } from "vitest";
import { z } from "zod";
import { lireIdentifiant, valider } from "./validation";

/** Erreur levée par `fn` (le test échoue si rien n'est levé). */
function erreurLevee(fn: () => unknown): unknown {
  try {
    fn();
  } catch (erreur) {
    return erreur;
  }
  throw new Error("Aucune erreur levée.");
}

describe("valider", () => {
  const schema = z.strictObject({ nom: z.string().min(1, { error: "Le nom est obligatoire." }) });

  it("renvoie la saisie validée", () => {
    expect(valider(schema, { nom: "TD2" }, "Classe")).toEqual({ nom: "TD2" });
  });

  it("lève une erreur VALIDATION détaillée par champ", () => {
    expect(erreurLevee(() => valider(schema, { nom: "" }, "Classe"))).toMatchObject({
      code: "VALIDATION",
      details: [{ chemin: "nom", message: "Le nom est obligatoire." }],
    });
  });
});

describe("lireIdentifiant", () => {
  it("accepte un UUID", () => {
    expect(lireIdentifiant("3f2b8c1e-0000-4000-8000-000000000001", "QCM")).toBe(
      "3f2b8c1e-0000-4000-8000-000000000001",
    );
  });

  it("répond « introuvable » pour un identifiant mal formé, sans refus journalisé", () => {
    expect(erreurLevee(() => lireIdentifiant("../etc/passwd", "QCM"))).toMatchObject({
      code: "INTROUVABLE",
      message: "QCM introuvable.",
      refusAcces: false,
    });
  });

  it("renvoie l'identifiant en minuscules", () => {
    expect(lireIdentifiant("3F2B8C1E-0000-4000-8000-00000000000A", "QCM")).toBe(
      "3f2b8c1e-0000-4000-8000-00000000000a",
    );
  });
});
