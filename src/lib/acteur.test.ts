import { describe, expect, it } from "vitest";
import {
  estAdministrateur,
  exigerRole,
  LIBELLES_ROLE,
  peutGererRole,
  ROLES,
  type ActeurUtilisateur,
  type Role,
} from "./acteur";
import { ErreurService } from "./erreurs";

function acteur(role: Role): ActeurUtilisateur {
  return {
    type: "utilisateur",
    id: "11111111-1111-4111-8111-111111111111",
    sessionId: "22222222-2222-4222-8222-222222222222",
    email: "claire.arnaud@exemple.fr",
    nom: "Arnaud",
    prenom: "Claire",
    role,
  };
}

describe("exigerRole", () => {
  it("laisse passer un rôle autorisé", () => {
    expect(() => exigerRole(acteur("admin"), ["admin", "super_admin"])).not.toThrow();
  });

  it("refuse un autre rôle avec ACCES_REFUSE", () => {
    let erreur: unknown;
    try {
      exigerRole(acteur("enseignant"), ["admin", "super_admin"]);
    } catch (e) {
      erreur = e;
    }
    expect(erreur).toBeInstanceOf(ErreurService);
    expect((erreur as ErreurService).code).toBe("ACCES_REFUSE");
  });
});

describe("peutGererRole", () => {
  it.each([
    ["super_admin", "super_admin", true],
    ["super_admin", "admin", true],
    ["super_admin", "enseignant", true],
    ["admin", "super_admin", false],
    ["admin", "admin", false],
    ["admin", "enseignant", true],
    ["enseignant", "enseignant", false],
    ["enseignant", "admin", false],
  ] as const)("%s gère un compte %s : %s", (role, cible, attendu) => {
    expect(peutGererRole(acteur(role), cible)).toBe(attendu);
  });
});

describe("rôles", () => {
  it("estAdministrateur ne concerne que l'admin et le super-admin", () => {
    expect(estAdministrateur("super_admin")).toBe(true);
    expect(estAdministrateur("admin")).toBe(true);
    expect(estAdministrateur("enseignant")).toBe(false);
  });

  it("chaque rôle a un libellé", () => {
    expect(ROLES.map((r) => LIBELLES_ROLE[r])).toEqual(["Super-admin", "Admin", "Enseignant"]);
  });
});
