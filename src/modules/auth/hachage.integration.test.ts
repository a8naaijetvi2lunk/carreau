import { describe, expect, it } from "vitest";
import { hacherMotDePasse, verifierMotDePasse, verifierMotDePasseFactice } from "./hachage";

describe("hachage des mots de passe", () => {
  it("hache en argon2id avec les paramètres OWASP et vérifie", async () => {
    const hachage = await hacherMotDePasse("une phrase de passe solide");
    expect(hachage.startsWith("$argon2id$v=19$m=19456,t=2,p=1$")).toBe(true);
    expect(await verifierMotDePasse(hachage, "une phrase de passe solide")).toBe(true);
    expect(await verifierMotDePasse(hachage, "une autre phrase")).toBe(false);
  });

  it("un hachage illisible ne lève pas d'exception", async () => {
    expect(await verifierMotDePasse("pas-un-hachage", "x")).toBe(false);
  });

  it("la vérification factice renvoie toujours faux", async () => {
    expect(await verifierMotDePasseFactice("une phrase de passe solide")).toBe(false);
    expect(await verifierMotDePasseFactice("deuxième appel")).toBe(false);
  });
});
