import { describe, expect, it } from "vitest";
import { configCookie } from "@/lib/cookie-session";
import { env } from "@/lib/env";
import { lireCookiesEntree, nomsCookiesEntree, poserCookiesEntree } from "./cookies";

describe("cookies des téléphones", () => {
  it("suivent la règle __Host-/Secure de l'URL publique", () => {
    const noms = nomsCookiesEntree();
    expect(noms.ticket).toBe(configCookie(env().APP_URL, "carreau-entree").nom);
    expect(noms.appareil).toBe(configCookie(env().APP_URL, "carreau-participation").nom);
  });

  it("lit le ticket et le jeton dans l'en-tête Cookie", () => {
    const noms = nomsCookiesEntree();
    const entetes = new Headers({ cookie: `autre=1; ${noms.ticket}=v1.a; ${noms.appareil}=jeton` });
    expect(lireCookiesEntree(entetes)).toEqual({ ticket: "v1.a", jetonAppareil: "jeton" });
    expect(lireCookiesEntree(new Headers())).toEqual({ ticket: null, jetonAppareil: null });
  });

  it("pose le ticket pour 10 minutes et le jeton d'appareil pour 30 jours", () => {
    const noms = nomsCookiesEntree();
    const reponse = poserCookiesEntree(Response.json({}), { ticket: "v1.t", jetonAppareil: "j" });
    const cookies = reponse.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toMatch(
      new RegExp(`^${noms.ticket}=v1\\.t; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`),
    );
    expect(cookies[1]).toMatch(
      new RegExp(`^${noms.appareil}=j; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`),
    );
    expect(poserCookiesEntree(Response.json({}), {}).headers.getSetCookie()).toEqual([]);
  });
});
