import { describe, expect, it } from "vitest";
import { construireCsp, requeteEnHttps } from "./csp";

describe("construireCsp", () => {
  const base = { nonce: "bm9uY2U=", developpement: false, https: true };

  it("autorise les scripts et les styles qui portent le nonce", () => {
    const csp = construireCsp(base);
    expect(csp).toContain("script-src 'self' 'nonce-bm9uY2U=' 'strict-dynamic'");
    expect(csp).toContain("style-src 'self' 'nonce-bm9uY2U='");
  });

  it("interdit l'intégration dans un cadre et les objets", () => {
    const csp = construireCsp(base);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("default-src 'self'");
  });

  it("n'autorise 'unsafe-eval' qu'en développement", () => {
    expect(construireCsp(base)).not.toContain("'unsafe-eval'");
    expect(construireCsp({ ...base, developpement: true })).toContain("'unsafe-eval'");
  });

  it("ne force HTTPS que si la requête est arrivée en HTTPS", () => {
    expect(construireCsp(base)).toContain("upgrade-insecure-requests");
    expect(construireCsp({ ...base, https: false })).not.toContain("upgrade-insecure-requests");
  });
});

describe("requeteEnHttps", () => {
  it.each<[Record<string, string>, string, boolean]>([
    [{ "x-forwarded-proto": "https" }, "http:", true],
    [{ "x-forwarded-proto": "http" }, "http:", false],
    [{ "x-forwarded-proto": "http, https" }, "http:", true],
    [{ "x-forwarded-proto": "HTTPS" }, "http:", true],
    [{}, "https:", true],
    [{}, "http:", false],
  ])("en-têtes %o et protocole %s → %s", (valeurs, protocole, attendu) => {
    expect(requeteEnHttps(new Headers(valeurs), protocole)).toBe(attendu);
  });
});
