import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ErreurService, erreurDepuisDetails, erreurDepuisZod, erreurs } from "./erreurs";

describe("ErreurService", () => {
  it.each([
    [erreurs.nonConnecte(), "NON_CONNECTE", 401],
    [erreurs.accesRefuse(), "ACCES_REFUSE", 403],
    [erreurs.introuvable("Session"), "INTROUVABLE", 404],
    [erreurs.validation("Données invalides."), "VALIDATION", 422],
    [erreurs.etat("Session terminée."), "ETAT", 409],
    [erreurs.conflit("Nom déjà pris."), "CONFLIT", 409],
    [erreurs.limiteAtteinte("Trop de tentatives."), "LIMITE_ATTEINTE", 429],
  ])("porte le code et le statut HTTP attendus (%#)", (erreur, code, statut) => {
    expect(erreur).toBeInstanceOf(ErreurService);
    expect(erreur.code).toBe(code);
    expect(erreur.statutHttp).toBe(statut);
  });

  it("formule le message d'une ressource introuvable", () => {
    expect(erreurs.introuvable("Session").message).toBe("Session introuvable.");
  });

  it("transmet le délai d'une limite atteinte seulement s'il est connu", () => {
    expect(erreurs.limiteAtteinte("Trop de tentatives.", 90).details).toEqual({ reessayerApresSecondes: 90 });
    expect(erreurs.limiteAtteinte("Trop de tentatives.").details).toBeUndefined();
  });

  it("conserve les détails d'une erreur d'état", () => {
    expect(erreurs.etat("Session terminée.", { raison: "terminee" }).details).toEqual({ raison: "terminee" });
  });
});

describe("erreurDepuisDetails", () => {
  it("résume au plus cinq détails et compte les autres", () => {
    const details = Array.from({ length: 7 }, (_, i) => ({ chemin: `champ${i}`, message: "requis" }));
    const erreur = erreurDepuisDetails(details, "Question");
    expect(erreur.code).toBe("VALIDATION");
    expect(erreur.message).toBe(
      "Question : données invalides (champ0 : requis ; champ1 : requis ; champ2 : requis ; champ3 : requis ; champ4 : requis (et 2 autre(s)))",
    );
    expect(erreur.details).toEqual(details);
  });

  it("omet le chemin quand il est vide", () => {
    expect(erreurDepuisDetails([{ chemin: "", message: "vide" }], "Corps").message).toBe(
      "Corps : données invalides (vide)",
    );
  });
});

describe("erreurDepuisZod", () => {
  it("convertit les problèmes Zod en détails lisibles, en français", () => {
    const resultat = z.object({ nom: z.string() }).safeParse({ nom: 3 });
    expect(resultat.success).toBe(false);
    if (resultat.success) return;
    const erreur = erreurDepuisZod(resultat.error, "Étudiant");
    expect(erreur.details).toEqual([{ chemin: "nom", message: expect.any(String) }]);
    expect(erreur.message).toMatch(/^Étudiant : données invalides \(nom : /);
    expect(erreur.message).not.toMatch(/Invalid input/);
  });
});
