import { describe, expect, it } from "vitest";
import { erreurs } from "./erreurs";
import {
  lignesDetails,
  resultatErreur,
  resultatErreurInattendue,
  resultatErreurService,
  resultatSucces,
} from "./resultats-mcp";

function texte(resultat: { content: { text: string }[] }): unknown {
  return JSON.parse(resultat.content[0]?.text ?? "null");
}

describe("résultats d'outils MCP", () => {
  it("renvoie les données en JSON indenté, en texte brut", () => {
    const resultat = resultatSucces({ titre: "<b>QCM</b>", n: 2 });
    expect(resultat.isError).toBeUndefined();
    expect(resultat.content).toEqual([{ type: "text", text: '{\n  "titre": "<b>QCM</b>",\n  "n": 2\n}' }]);
  });

  it("présente une erreur de service avec son code, son message et ses détails lisibles", () => {
    const erreur = erreurs.validation("Question : données invalides", [
      { chemin: "enonce", message: "L'énoncé dépasse 2000 caractères." },
      { chemin: "", message: "Données invalides." },
    ]);
    const resultat = resultatErreurService(erreur);
    expect(resultat.isError).toBe(true);
    expect(texte(resultat)).toEqual({
      code: "VALIDATION",
      message: "Question : données invalides",
      details: ["enonce : L'énoncé dépasse 2000 caractères.", "Données invalides."],
    });
    expect(texte(resultatErreurService(erreurs.introuvable("QCM")))).toEqual({
      code: "INTROUVABLE",
      message: "QCM introuvable.",
    });
  });

  it("ignore les détails qui ne sont pas une liste de { chemin, message }", () => {
    expect(lignesDetails(undefined)).toEqual([]);
    expect(lignesDetails({ reessayerApresSecondes: 60 })).toEqual([]);
    expect(lignesDetails([null, 3, { chemin: "a" }, { message: 4 }, { message: "ok" }])).toEqual(["ok"]);
  });

  it("construit une erreur directe et une erreur inattendue avec sa référence", () => {
    expect(texte(resultatErreur("ACCES_REFUSE", "Lecture seule."))).toEqual({
      code: "ACCES_REFUSE",
      message: "Lecture seule.",
    });
    const inattendue = resultatErreurInattendue("AB12CD34");
    expect(inattendue.isError).toBe(true);
    expect(texte(inattendue)).toEqual({
      code: "INTERNE",
      message: "Une erreur inattendue est survenue (réf. AB12CD34).",
    });
  });
});
