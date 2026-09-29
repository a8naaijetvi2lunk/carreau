import { describe, expect, it } from "vitest";
import { configCookieSession } from "./cookie-session";

describe("configCookieSession", () => {
  it("URL publique en HTTPS : préfixe __Host- et attribut Secure", () => {
    expect(configCookieSession("https://carreau.exemple.fr")).toEqual({
      nom: "__Host-carreau_session",
      securise: true,
    });
  });

  it("URL publique en HTTP (développement, bout en bout) : ni préfixe ni Secure", () => {
    expect(configCookieSession("http://localhost:50172")).toEqual({
      nom: "carreau_session",
      securise: false,
    });
  });
});
