import { beforeEach, describe, expect, it } from "vitest";
import { appliquerEnvValide } from "@/test/env-valide";
import { signer, verifierSignature } from "./signature";

describe("signature d'un contenu (HMAC-SHA256, clé dérivée de CHIFFREMENT_CLE)", () => {
  beforeEach(() => appliquerEnvValide());

  it("rend le contenu d'une valeur signée pour le même usage", () => {
    const valeur = signer("v1.a.b", "ticket-entree");
    expect(valeur.startsWith("v1.a.b.")).toBe(true);
    expect(verifierSignature(valeur, "ticket-entree")).toBe("v1.a.b");
  });

  it("refuse un contenu modifié", () => {
    const valeur = signer("v1.session-a", "ticket-entree");
    expect(verifierSignature(valeur.replace("session-a", "session-b"), "ticket-entree")).toBeNull();
  });

  it("refuse une signature modifiée ou absente", () => {
    const valeur = signer("contenu", "ticket-entree");
    const derniere = valeur.endsWith("A") ? "B" : "A";
    expect(verifierSignature(`${valeur.slice(0, -1)}${derniere}`, "ticket-entree")).toBeNull();
    expect(verifierSignature("contenu", "ticket-entree")).toBeNull();
    expect(verifierSignature(".signature", "ticket-entree")).toBeNull();
  });

  it("refuse une valeur signée pour un autre usage", () => {
    expect(verifierSignature(signer("contenu", "ticket-entree"), "autre-usage")).toBeNull();
  });

  it("refuse une valeur signée avec une autre clé", () => {
    const valeur = signer("contenu", "ticket-entree");
    appliquerEnvValide({ CHIFFREMENT_CLE: Buffer.alloc(32, 9).toString("base64") });
    expect(verifierSignature(valeur, "ticket-entree")).toBeNull();
  });
});
