import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MESSAGE_REQUETE_MASQUE,
  estErreurRequete,
  journaliserErreurInattendue,
  resumerErreur,
} from "./journal-erreur";

describe("resumerErreur", () => {
  it("masque les paramètres d'une requête SQL en échec", () => {
    const erreur = Object.assign(new Error("Failed query: select 1 where nom = $1\nparams: Dupont"), {
      query: "select 1 where nom = $1",
      params: ["Dupont"],
      cause: {
        code: "23505",
        constraint: "etudiant_nom_unique",
        table: "etudiant",
        column: "nom",
        detail: "Key (nom)=(Dupont) already exists.",
      },
    });
    const resume = resumerErreur(erreur);
    expect(resume).toEqual({
      nom: "DrizzleQueryError",
      message: MESSAGE_REQUETE_MASQUE,
      code: "23505",
      contrainte: "etudiant_nom_unique",
      table: "etudiant",
      colonne: "nom",
      requete: "select 1 where nom = $1",
    });
    expect(JSON.stringify(resume)).not.toContain("Dupont");
  });

  it("garde nom, message et pile d'une erreur ordinaire", () => {
    const resume = resumerErreur(new TypeError("boum"));
    expect(resume.nom).toBe("TypeError");
    expect(resume.message).toBe("boum");
    expect(resume.pile).toContain("boum");
  });

  it("décrit un objet sans nom ni message", () => {
    expect(resumerErreur({})).toEqual({ nom: "Error", message: "(sans message)" });
  });

  it("décrit une valeur non structurée sans l'exposer", () => {
    expect(resumerErreur("secret")).toEqual({ nom: "string", message: "(valeur levée non structurée)" });
  });

  it("reconnaît une erreur de requête à sa forme", () => {
    expect(estErreurRequete({ query: "select 1", params: [] })).toBe(true);
    expect(estErreurRequete(new Error("x"))).toBe(false);
    expect(estErreurRequete(null)).toBe(false);
  });
});

describe("journaliserErreurInattendue", () => {
  afterEach(() => vi.restoreAllMocks());

  it("écrit l'origine, la référence et le seul résumé", () => {
    const espion = vi.spyOn(console, "error").mockImplementation(() => {});
    journaliserErreurInattendue("api", "AB12CD34", { query: "select $1", params: ["mot de passe"] });
    expect(espion).toHaveBeenCalledWith(
      "[api] Erreur inattendue (réf. AB12CD34)",
      expect.objectContaining({ message: MESSAGE_REQUETE_MASQUE }),
    );
    expect(JSON.stringify(espion.mock.calls)).not.toContain("mot de passe");
  });
});
