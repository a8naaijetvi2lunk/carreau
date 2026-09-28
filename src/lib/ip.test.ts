import { describe, expect, it } from "vitest";
import { IP_INCONNUE, lireIpClient } from "./ip";

describe("lireIpClient", () => {
  it("préfère X-Real-IP, posé par le proxy", () => {
    const entetes = new Headers({
      "x-real-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.1, 203.0.113.9",
    });
    expect(lireIpClient(entetes)).toBe("203.0.113.7");
  });

  it("prend la dernière valeur de X-Forwarded-For, jamais la première", () => {
    expect(lireIpClient(new Headers({ "x-forwarded-for": "10.0.0.1, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("renvoie « inconnue » sans en-tête", () => {
    expect(lireIpClient(new Headers())).toBe(IP_INCONNUE);
  });

  it("tronque une valeur anormalement longue à 100 caractères", () => {
    expect(lireIpClient(new Headers({ "x-real-ip": "a".repeat(300) }))).toHaveLength(100);
  });
});
