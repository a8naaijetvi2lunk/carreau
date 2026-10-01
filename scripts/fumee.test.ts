import { describe, expect, it } from "vitest";
import { tailleEntetes, verifierInstance } from "./fumee.mjs";

const HTTPS = "https://carreau.exemple.fr";
const ENTETES_ACCUEIL = {
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "content-security-policy": "default-src 'self'; script-src 'self' 'nonce-abc123' 'strict-dynamic'",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

type Reponses = Record<string, () => Response>;

/** Instance saine à l'adresse `base`, dont `surcharges` remplace des réponses (« MÉTHODE chemin »). */
function instance(base: string, surcharges: Reponses = {}): typeof fetch {
  const reponses: Reponses = {
    "GET /api/sante": () => Response.json({ ok: true }),
    "GET /": () => new Response("<html></html>", { headers: ENTETES_ACCUEIL }),
    "GET /manifest.webmanifest": () =>
      new Response("{}", { headers: { "content-type": "application/manifest+json" } }),
    "GET /sw.js": () =>
      new Response("", { headers: { "cache-control": "no-cache, no-store, must-revalidate" } }),
    "GET /rejoindre": () =>
      new Response("", { headers: { "permissions-policy": "camera=(self), microphone=(), geolocation=()" } }),
    "POST /api/mcp": () => Response.json({}, { status: 401 }),
    "POST /api/cron/purges": () => Response.json({}, { status: 401 }),
    ...surcharges,
  };
  return (async (url: string | URL | Request, options?: RequestInit) => {
    const adresse = new URL(String(url));
    if (adresse.protocol === "http:" && base.startsWith("https:")) {
      return new Response(null, { status: 301, headers: { location: `${base}/` } });
    }
    const reponse = reponses[`${options?.method ?? "GET"} ${adresse.pathname}`];
    return reponse ? reponse() : new Response("introuvable", { status: 404 });
  }) as typeof fetch;
}

async function echecs(base: string, surcharges: Reponses = {}) {
  return (await verifierInstance(base, instance(base, surcharges))).filter((r) => !r.ok);
}

describe("verifierInstance (décision D10 du plan du lot 10)", () => {
  it("une instance saine en https passe les huit contrôles", async () => {
    const resultats = await verifierInstance(HTTPS, instance(HTTPS));
    expect(resultats).toHaveLength(8);
    expect(resultats.filter((r) => !r.ok)).toEqual([]);
  });

  it("en http (serveur local), la redirection vers https n'est pas contrôlée", async () => {
    const base = "http://localhost:50172";
    const resultats = await verifierInstance(base, instance(base));
    expect(resultats.map((r) => r.nom)).not.toContain("redirection vers https");
    expect(resultats.filter((r) => !r.ok)).toEqual([]);
  });

  it("nomme chaque défaut des en-têtes de l'accueil", async () => {
    const accueil = (entetes: Record<string, string>) => ({
      "GET /": () => new Response("", { headers: { ...ENTETES_ACCUEIL, ...entetes } }),
    });
    expect(
      (await echecs(HTTPS, accueil({ "strict-transport-security": "max-age=1, max-age=2" })))[0]?.detail,
    ).toBe("HSTS : en double");
    expect(
      (await echecs(HTTPS, accueil({ "content-security-policy": "default-src 'self'" })))[0]?.detail,
    ).toBe("CSP sans nonce");
    expect((await echecs(HTTPS, accueil({ "x-remplissage": "a".repeat(5000) })))[0]?.detail).toMatch(
      /^en-têtes de \d+ octets \(4 096 au plus\)$/,
    );
  });

  it("signale une route ouverte sans secret et une erreur réseau", async () => {
    const ouverte = await echecs(HTTPS, {
      "POST /api/cron/purges": () => Response.json({}, { status: 200 }),
    });
    expect(ouverte).toEqual([{ nom: "purges sans secret", ok: false, detail: "statut 200" }]);
    const panne = await echecs(HTTPS, {
      "GET /api/sante": () => {
        throw new Error("connexion refusée");
      },
    });
    expect(panne).toEqual([{ nom: "santé", ok: false, detail: "connexion refusée" }]);
  });

  it("mesure les en-têtes : nom, valeur et quatre octets de séparation", () => {
    expect(tailleEntetes(new Headers({ a: "b", cd: "ef" }))).toBe(6 + 8);
  });
});
