import { describe, expect, it } from "vitest";
import type { ActeurUtilisateur } from "./acteur";
import { acteurDepuisAuthInfo, authInfoDepuisActeur } from "./identite-mcp";

const ACTEUR: ActeurUtilisateur = {
  type: "utilisateur",
  id: "22222222-2222-4222-8222-222222222222",
  sessionId: null,
  jetonMcp: { id: "33333333-3333-4333-8333-333333333333", portee: "lecture" },
  email: "claire.arnaud@exemple.fr",
  nom: "Arnaud",
  prenom: "Claire",
  role: "enseignant",
};

describe("identité d'un appel MCP", () => {
  it("ne place dans l'AuthInfo que l'identifiant du jeton, jamais le jeton", () => {
    const authInfo = authInfoDepuisActeur(ACTEUR);
    expect(authInfo).toEqual({
      token: "33333333-3333-4333-8333-333333333333",
      clientId: "33333333-3333-4333-8333-333333333333",
      scopes: ["lecture"],
      extra: { acteur: ACTEUR },
    });
    expect(acteurDepuisAuthInfo(authInfo)).toEqual(ACTEUR);
  });

  it("refuse un acteur sans jeton MCP", () => {
    expect(() => authInfoDepuisActeur({ ...ACTEUR, jetonMcp: undefined })).toThrow("Acteur sans jeton MCP.");
  });

  it("ne reconstruit aucun acteur d'une AuthInfo absente ou incohérente", () => {
    expect(acteurDepuisAuthInfo(undefined)).toBeNull();
    const base = authInfoDepuisActeur(ACTEUR);
    for (const extra of [
      undefined,
      {},
      { acteur: { ...ACTEUR, sessionId: "44444444-4444-4444-8444-444444444444" } },
      { acteur: { ...ACTEUR, jetonMcp: undefined } },
      { acteur: { ...ACTEUR, jetonMcp: { id: ACTEUR.id, portee: "admin" } } },
      { acteur: { ...ACTEUR, role: "etudiant" } },
      { acteur: { ...ACTEUR, intrus: true } },
    ]) {
      expect(acteurDepuisAuthInfo({ ...base, extra })).toBeNull();
    }
  });
});
