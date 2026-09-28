import { beforeEach, describe, expect, it } from "vitest";
import { appliquerEnvValide } from "@/test/env-valide";
import { chiffrer, dechiffrer } from "./chiffrement";

describe("chiffrement AES-256-GCM", () => {
  beforeEach(() => appliquerEnvValide());

  it("retrouve le texte d'origine", () => {
    expect(dechiffrer(chiffrer("re_clé_secrète_ü"))).toBe("re_clé_secrète_ü");
  });

  it("produit un résultat différent à chaque appel", () => {
    expect(chiffrer("même texte")).not.toBe(chiffrer("même texte"));
  });

  it("suit le format versionné v1.<iv>.<tag>.<données>", () => {
    const parties = chiffrer("x").split(".");
    expect(parties).toHaveLength(4);
    expect(parties[0]).toBe("v1");
  });

  it("détecte une altération des données", () => {
    const [version, iv, tag, donnees] = chiffrer("texte").split(".") as [string, string, string, string];
    const alteree = Buffer.from(donnees, "base64url");
    alteree[0] = (alteree[0] ?? 0) ^ 1;
    expect(() => dechiffrer([version, iv, tag, alteree.toString("base64url")].join("."))).toThrow();
  });

  it("refuse une version inconnue", () => {
    expect(() => dechiffrer(chiffrer("texte").replace(/^v1\./, "v2."))).toThrow(/format ou version/);
  });

  it("refuse un encodage non canonique", () => {
    const parties = chiffrer("texte").split(".");
    parties[1] = `${parties[1]}!`;
    expect(() => dechiffrer(parties.join("."))).toThrow(/encodage invalide/);
  });

  it("refuse un vecteur d'initialisation de mauvaise longueur", () => {
    const parties = chiffrer("texte").split(".");
    parties[1] = Buffer.alloc(8).toString("base64url");
    expect(() => dechiffrer(parties.join("."))).toThrow(/format non reconnu/);
  });

  it("échoue avec une autre clé", () => {
    const chiffre = chiffrer("texte");
    appliquerEnvValide({ CHIFFREMENT_CLE: Buffer.alloc(32, 9).toString("base64") });
    expect(() => dechiffrer(chiffre)).toThrow();
  });
});
