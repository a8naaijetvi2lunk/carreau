import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FORMAT_JETON, sha256Hex } from "@/lib/jetons";
import { schemaEmail } from "@/lib/saisies";
import { cleConnexionCompte, cleDoubleAuth } from "@/modules/auth";
import { VALIDITE_INVITATION_DEFAUT_JOURS } from "@/modules/parametres";
import * as commun from "./admin-commun.mjs";

const ADRESSES = [
  ["claire.arnaud@exemple.fr", true],
  ["  Yves@Exemple.FR ", true],
  ["o'brien+test@iut-tc.fr", true],
  ["prénom.nom@iut-tc.fr", false],
  ["jean..dupont@lycee.fr", false],
  ["yves@sous_domaine.fr", false],
  ["a@b.c", false],
  ["a@b.fr.", false],
  ["<a>@b.fr", false],
  ["", false],
  ["a".repeat(250) + "@b.fr", false],
] as const;

describe("valeurs dupliquées dans les scripts d'administration", () => {
  it("jetons et empreintes identiques aux modules TypeScript", () => {
    expect(commun.genererJeton()).toMatch(FORMAT_JETON);
    expect(commun.sha256Hex("abc")).toBe(sha256Hex("abc"));
  });

  it("clés du limiteur identiques", () => {
    expect(commun.cleConnexionCompte("claire@exemple.fr")).toBe(cleConnexionCompte("claire@exemple.fr"));
    expect(commun.cleDoubleAuth("11111111-1111-4111-8111-111111111111")).toBe(
      cleDoubleAuth("11111111-1111-4111-8111-111111111111"),
    );
  });

  it("validité par défaut des invitations identique", () => {
    expect(commun.VALIDITE_INVITATION_JOURS).toBe(VALIDITE_INVITATION_DEFAUT_JOURS);
  });

  it("normalise l'adresse comme le schéma de saisie", () => {
    expect(commun.normaliserEmail("  Yves@Exemple.FR ")).toBe(schemaEmail.parse("  Yves@Exemple.FR "));
    expect(() => commun.normaliserEmail("pas-une-adresse")).toThrow("Adresse email invalide.");
    expect(() => commun.normaliserEmail(undefined)).toThrow("Adresse email invalide.");
  });

  it("REGEX_EMAIL est exactement celle de z.email() (Zod 4)", () => {
    expect(commun.REGEX_EMAIL.source).toBe(z.regexes.email.source);
  });

  it.each(ADRESSES)("normaliserEmail(%j) suit le verdict de schemaEmail", (adresse, valide) => {
    const resultat = schemaEmail.safeParse(adresse);
    expect(resultat.success).toBe(valide);
    if (resultat.success) {
      expect(commun.normaliserEmail(adresse)).toBe(resultat.data);
    } else {
      expect(() => commun.normaliserEmail(adresse)).toThrow("Adresse email invalide.");
    }
  });
});
