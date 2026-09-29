import { describe, expect, it } from "vitest";
import { FORMAT_JETON, genererJeton, sha256Hex } from "./jetons";

describe("jetons", () => {
  it("genererJeton produit 256 bits en base64url (43 caractères), jamais deux fois le même", () => {
    const a = genererJeton();
    const b = genererJeton();
    expect(a).toMatch(FORMAT_JETON);
    expect(b).toMatch(FORMAT_JETON);
    expect(a).not.toBe(b);
  });

  it("FORMAT_JETON refuse une autre longueur ou un caractère hors base64url", () => {
    expect(FORMAT_JETON.test("a".repeat(42))).toBe(false);
    expect(FORMAT_JETON.test("a".repeat(44))).toBe(false);
    expect(FORMAT_JETON.test(`${"a".repeat(42)}+`)).toBe(false);
  });

  it("sha256Hex donne l'empreinte hexadécimale", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
