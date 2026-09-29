import { describe, expect, it } from "vitest";
import {
  ALPHABET_CODE,
  calculerCode,
  codeAccepte,
  codeCourant,
  fenetreCode,
  formaterCode,
  normaliserCode,
  PERIODE_CODE_MS,
} from "./code-session";

/** Secrets de test : 32 octets à 1, puis à 2, en base64url. */
const SECRET_1 = Buffer.alloc(32, 1).toString("base64url");
const SECRET_2 = Buffer.alloc(32, 2).toString("base64url");
/** 21/09/2026 14:13:20 UTC : 20 s dans la fenêtre 59 666 666. */
const INSTANT = new Date(1_790_000_000_000);
const POINT_MEDIAN = String.fromCharCode(0xb7);

describe("fenetreCode", () => {
  it("numérote les fenêtres de 30 s depuis l'origine des temps Unix", () => {
    expect(PERIODE_CODE_MS).toBe(30_000);
    expect(fenetreCode(INSTANT)).toBe(59_666_666);
    expect(fenetreCode(new Date(59_666_667 * 30_000 - 1))).toBe(59_666_666);
    expect(fenetreCode(new Date(59_666_667 * 30_000))).toBe(59_666_667);
  });
});

describe("calculerCode", () => {
  it("donne les valeurs de référence (HMAC-SHA256, 30 bits, alphabet de Crockford)", () => {
    expect(SECRET_1).toBe("AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE");
    expect(calculerCode(SECRET_1, 59_666_665)).toBe("QXCPKC");
    expect(calculerCode(SECRET_1, 59_666_666)).toBe("3PD4Y2");
    expect(calculerCode(SECRET_1, 59_666_667)).toBe("31P8Z4");
    expect(calculerCode(SECRET_2, 59_666_666)).toBe("4Q1ME0");
    expect(calculerCode(SECRET_1, 0)).toBe("JMX69M");
  });

  it("n'emploie que les 32 caractères de l'alphabet, sans I, L, O ni U", () => {
    expect(ALPHABET_CODE).toBe("0123456789ABCDEFGHJKMNPQRSTVWXYZ");
    for (let fenetre = 59_666_000; fenetre < 59_667_000; fenetre++) {
      expect(calculerCode(SECRET_1, fenetre)).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
    }
  });
});

describe("codeCourant", () => {
  it("donne le code de la fenêtre et les secondes avant le suivant (1 à 30)", () => {
    expect(codeCourant(SECRET_1, INSTANT)).toEqual({ code: "3PD4Y2", secondesRestantes: 10 });
    expect(codeCourant(SECRET_1, new Date(59_666_666 * 30_000)).secondesRestantes).toBe(30);
    expect(codeCourant(SECRET_1, new Date(59_666_667 * 30_000 - 1)).secondesRestantes).toBe(1);
  });
});

describe("codeAccepte", () => {
  it("accepte le code courant et le précédent, pas le suivant", () => {
    expect(codeAccepte(SECRET_1, "3PD4Y2", INSTANT)).toBe(true);
    expect(codeAccepte(SECRET_1, "QXCPKC", INSTANT)).toBe(true);
    expect(codeAccepte(SECRET_1, "31P8Z4", INSTANT)).toBe(false);
  });

  it("refuse le code d'une autre session, un code trop ancien ou de mauvaise longueur", () => {
    expect(codeAccepte(SECRET_1, "4Q1ME0", INSTANT)).toBe(false);
    expect(codeAccepte(SECRET_1, "QXCPKC", new Date(INSTANT.getTime() + 30_000))).toBe(false);
    expect(codeAccepte(SECRET_1, "3PD", INSTANT)).toBe(false);
  });
});

describe("normaliserCode et formaterCode", () => {
  it("lit une saisie en minuscules, avec espaces, points, points médians ou tirets", () => {
    expect(normaliserCode("3pd 4y2")).toBe("3PD4Y2");
    expect(normaliserCode(`3PD${POINT_MEDIAN}4Y2`)).toBe("3PD4Y2");
    expect(normaliserCode("k7m-4qp")).toBe("K7M4QP");
    expect(normaliserCode(" K7M.4QP ")).toBe("K7M4QP");
  });

  it("lit O comme 0, I et L comme 1 (décodage de Crockford)", () => {
    expect(normaliserCode("QXCPKO")).toBe("QXCPK0");
    expect(normaliserCode("il0123")).toBe("110123");
  });

  it("refuse une longueur autre que 6 ou un caractère hors de l'alphabet", () => {
    expect(normaliserCode("3PD4Y")).toBeNull();
    expect(normaliserCode("3PD4Y2X")).toBeNull();
    expect(normaliserCode("3PD4U2")).toBeNull();
    expect(normaliserCode("3PD4Y!")).toBeNull();
    expect(normaliserCode("")).toBeNull();
  });

  it("affiche le code en deux groupes de trois", () => {
    expect(formaterCode("K7M4QP")).toBe("K7M 4QP");
  });
});
