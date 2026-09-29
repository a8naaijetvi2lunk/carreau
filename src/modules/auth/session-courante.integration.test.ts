import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configCookieSession } from "@/lib/cookie-session";
import { env } from "@/lib/env";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import {
  acteurCourant,
  effacerCookieSession,
  exigerActeur,
  jetonSessionCourant,
  ouvrirSessionEnAttente,
  poserCookieSession,
  sessionEnAttenteCourante,
} from "@/modules/auth";
import { creerUtilisateur, ouvrirSessionComplete } from "@/test/comptes";

/** Cookies de la « requête » du test : lus par `cookies().get`, écrits par `cookies().set`. */
const magasin = vi.hoisted(() => ({
  valeurs: new Map<string, string>(),
  options: new Map<string, Record<string, unknown>>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nom: string) => {
      const value = magasin.valeurs.get(nom);
      return value === undefined ? undefined : { name: nom, value };
    },
    set: (nom: string, value: string, options: Record<string, unknown>) => {
      magasin.options.set(nom, options);
      if (options.maxAge === 0) magasin.valeurs.delete(nom);
      else magasin.valeurs.set(nom, value);
    },
  }),
}));

function nomCookie(): string {
  return configCookieSession(env().APP_URL).nom;
}

beforeEach(() => {
  magasin.valeurs.clear();
  magasin.options.clear();
  definirHorlogePourLesTests(horlogeFixe(Date.parse("2026-09-29T08:00:00.000Z")));
});
afterEach(() => definirHorlogePourLesTests());

describe("session courante", () => {
  it("sans cookie : aucun acteur, exigerActeur lève NON_CONNECTE", async () => {
    expect(await jetonSessionCourant()).toBeNull();
    expect(await acteurCourant()).toBeNull();
    expect(await sessionEnAttenteCourante()).toBeNull();
    await expect(exigerActeur()).rejects.toMatchObject({ code: "NON_CONNECTE" });
  });

  it("avec une session complète : l'acteur de la requête", async () => {
    const u = await creerUtilisateur();
    const { jeton } = await ouvrirSessionComplete(u.id);
    magasin.valeurs.set(nomCookie(), jeton);
    expect((await exigerActeur()).id).toBe(u.id);
    expect(await sessionEnAttenteCourante()).toBeNull();
  });

  it("avec une session en attente : pas d'acteur, mais la session en attente", async () => {
    const u = await creerUtilisateur();
    const { jeton } = await ouvrirSessionEnAttente(u.id, false);
    magasin.valeurs.set(nomCookie(), jeton);
    expect(await acteurCourant()).toBeNull();
    expect((await sessionEnAttenteCourante())?.utilisateurId).toBe(u.id);
  });
});

describe("cookie de session", () => {
  it("pose un cookie httpOnly SameSite=Lax, sans expiration par défaut", async () => {
    await poserCookieSession("jeton-a", null);
    expect(magasin.valeurs.get(nomCookie())).toBe("jeton-a");
    expect(magasin.options.get(nomCookie())).toEqual({
      httpOnly: true,
      secure: configCookieSession(env().APP_URL).securise,
      sameSite: "lax",
      path: "/",
    });
  });

  it("« Rester connecté » : expiration fixée à la fin de la session", async () => {
    const fin = new Date("2026-10-29T08:00:00.000Z");
    await poserCookieSession("jeton-b", fin);
    expect(magasin.options.get(nomCookie())).toMatchObject({ expires: fin });
  });

  it("efface le cookie", async () => {
    await poserCookieSession("jeton-c", null);
    await effacerCookieSession();
    expect(magasin.valeurs.has(nomCookie())).toBe(false);
    expect(magasin.options.get(nomCookie())).toMatchObject({ maxAge: 0 });
  });
});
