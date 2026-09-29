import { describe, expect, it } from "vitest";
import { enteteCookie, lireCookie } from "./cookies";

function entetes(cookie?: string): Headers {
  return new Headers(cookie === undefined ? {} : { cookie });
}

describe("lireCookie", () => {
  it("lit la valeur d'un cookie parmi d'autres", () => {
    expect(lireCookie(entetes("a=1; carreau-entree=v1.x.y; b=2"), "carreau-entree")).toBe("v1.x.y");
  });

  it("ne confond pas deux noms qui commencent pareil", () => {
    expect(lireCookie(entetes("carreau-entree2=x"), "carreau-entree")).toBeNull();
  });

  it("renvoie null sans en-tête, sans le cookie, ou pour une valeur vide", () => {
    expect(lireCookie(entetes(), "a")).toBeNull();
    expect(lireCookie(entetes("b=2"), "a")).toBeNull();
    expect(lireCookie(entetes("a=; b=2"), "a")).toBeNull();
    expect(lireCookie(entetes("sansegal; a=1"), "a")).toBe("1");
  });

  it("garde un signe égal présent dans la valeur", () => {
    expect(lireCookie(entetes("a=b=c"), "a")).toBe("b=c");
  });
});

describe("enteteCookie", () => {
  it("pose HttpOnly, SameSite=Lax, Path=/ et Max-Age, sans Secure en HTTP", () => {
    expect(enteteCookie("carreau-entree", "abc.DEF_-~", { securise: false, dureeSecondes: 600 })).toBe(
      "carreau-entree=abc.DEF_-~; Path=/; HttpOnly; SameSite=Lax; Max-Age=600",
    );
  });

  it("ajoute Secure en HTTPS", () => {
    expect(enteteCookie("__Host-carreau-entree", "abc", { securise: true, dureeSecondes: 1 })).toBe(
      "__Host-carreau-entree=abc; Path=/; HttpOnly; SameSite=Lax; Max-Age=1; Secure",
    );
  });

  it("refuse une valeur qui pourrait ajouter un attribut", () => {
    expect(() => enteteCookie("a", "x; Domain=exemple.fr", { securise: false, dureeSecondes: 1 })).toThrow(
      "Valeur de cookie non sûre.",
    );
  });
});
