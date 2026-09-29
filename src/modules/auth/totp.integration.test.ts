import { describe, expect, it } from "vitest";
import {
  chiffrerSecretTotp,
  cleManuelle,
  dechiffrerSecretTotp,
  encoderBase32,
  genererCodeHotp,
  genererSecretTotp,
  pasDuCode,
  pasTotp,
  qrCodeTotp,
  uriTotp,
} from "./totp";

/** Secret des vecteurs de test des RFC 4226 et 6238 : « 12345678901234567890 » en ASCII. */
const SECRET_RFC = new Uint8Array(Buffer.from("12345678901234567890", "ascii"));
/** Secret fixe : octets 1 à 20 (base32 « AEBAGBAFAYDQQCIKBMGA2DQPCAIREEYU »). */
const SECRET = new Uint8Array(20).map((_, i) => i + 1);
const INSTANT = new Date("2026-09-29T08:00:10.000Z");

describe("HOTP (RFC 4226, annexe D)", () => {
  it("retrouve les dix codes de référence", () => {
    const attendus = [
      "755224",
      "287082",
      "359152",
      "969429",
      "338314",
      "254676",
      "287922",
      "162583",
      "399871",
      "520489",
    ];
    expect(attendus.map((_, compteur) => genererCodeHotp(SECRET_RFC, compteur))).toEqual(attendus);
  });
});

describe("TOTP (RFC 6238, annexe B, SHA-1, 8 chiffres)", () => {
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("à T = %i s, le code est %s", (secondes, code) => {
    expect(genererCodeHotp(SECRET_RFC, pasTotp(new Date(secondes * 1000)), 8)).toBe(code);
  });
});

describe("base32 (RFC 4648, sans remplissage)", () => {
  it.each([
    ["", ""],
    ["f", "MY"],
    ["fo", "MZXQ"],
    ["foo", "MZXW6"],
    ["foob", "MZXW6YQ"],
    ["fooba", "MZXW6YTB"],
    ["foobar", "MZXW6YTBOI"],
  ])("« %s » → « %s »", (texte, attendu) => {
    expect(encoderBase32(new Uint8Array(Buffer.from(texte, "ascii")))).toBe(attendu);
  });
});

describe("pas TOTP", () => {
  it("compte les périodes de 30 s depuis l'époque Unix", () => {
    expect(pasTotp(new Date(0))).toBe(0);
    expect(pasTotp(new Date(59_999))).toBe(1);
    expect(pasTotp(INSTANT)).toBe(Math.floor(INSTANT.getTime() / 30_000));
  });
});

describe("pasDuCode", () => {
  const pas = pasTotp(INSTANT);

  it.each([-1, 0, 1])("accepte le code du pas courant décalé de %i", (decalage) => {
    const code = genererCodeHotp(SECRET, pas + decalage);
    expect(pasDuCode(SECRET, code, INSTANT)).toBe(pas + decalage);
  });

  it("refuse le code d'un pas trop éloigné", () => {
    expect(pasDuCode(SECRET, genererCodeHotp(SECRET, pas + 2), INSTANT)).toBeNull();
  });

  it("refuse un code mal formé", () => {
    expect(pasDuCode(SECRET, "12345", INSTANT)).toBeNull();
    expect(pasDuCode(SECRET, "abcdef", INSTANT)).toBeNull();
    expect(pasDuCode(SECRET, "1234567", INSTANT)).toBeNull();
  });
});

describe("enrôlement", () => {
  it("tire un secret de 160 bits, chiffré au repos", () => {
    const secret = genererSecretTotp();
    expect(secret).toHaveLength(20);
    const chiffre = chiffrerSecretTotp(secret);
    expect(chiffre.startsWith("v1.")).toBe(true);
    expect(dechiffrerSecretTotp(chiffre)).toEqual(secret);
  });

  it("construit l'URI otpauth, la clé à saisir et le QR code", async () => {
    const uri = uriTotp(SECRET, "claire@exemple.fr");
    const url = new URL(uri);
    expect(url.protocol).toBe("otpauth:");
    expect(decodeURIComponent(url.pathname)).toBe("/Carreau:claire@exemple.fr");
    expect(url.searchParams.get("issuer")).toBe("Carreau");
    expect(url.searchParams.get("secret")).toBe("AEBAGBAFAYDQQCIKBMGA2DQPCAIREEYU");
    expect(url.searchParams.get("algorithm")).toBe("SHA1");
    expect(url.searchParams.get("digits")).toBe("6");
    expect(url.searchParams.get("period")).toBe("30");
    expect(cleManuelle(uri)).toBe("AEBA GBAF AYDQ QCIK BMGA 2DQP CAIR EEYU");

    const qr = await qrCodeTotp(uri);
    expect(qr.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(qr)).toContain("<svg");
  });
});
