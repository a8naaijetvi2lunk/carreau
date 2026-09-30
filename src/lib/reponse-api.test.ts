import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { erreurs } from "./erreurs";
import {
  lireCorpsBinaire,
  lireCorpsJson,
  reponseErreur,
  reponseFichier,
  reponseImage,
  reponseOk,
} from "./reponse-api";

function requeteJson(corps: string, type = "application/json"): Request {
  return new Request("http://localhost/api/essai", {
    method: "POST",
    headers: { "content-type": type },
    body: corps,
  });
}

describe("reponseErreur", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renvoie le statut et le corps d'une ErreurService, sans cache", async () => {
    const reponse = reponseErreur(erreurs.introuvable("Session"));
    expect(reponse.status).toBe(404);
    expect(reponse.headers.get("cache-control")).toBe("no-store");
    await expect(reponse.json()).resolves.toEqual({
      erreur: { code: "INTROUVABLE", message: "Session introuvable." },
    });
  });

  it("ajoute Retry-After, arrondi au supérieur, à une limite atteinte", () => {
    expect(reponseErreur(erreurs.limiteAtteinte("Trop de requêtes.", 12.2)).headers.get("retry-after")).toBe(
      "13",
    );
  });

  it("n'ajoute pas Retry-After quand le délai est inconnu", () => {
    expect(reponseErreur(erreurs.limiteAtteinte("Trop de requêtes.")).headers.get("retry-after")).toBeNull();
  });

  it("transmet les détails d'une erreur de validation", async () => {
    const reponse = reponseErreur(erreurs.validation("Invalide.", [{ chemin: "code", message: "requis" }]));
    await expect(reponse.json()).resolves.toEqual({
      erreur: { code: "VALIDATION", message: "Invalide.", details: [{ chemin: "code", message: "requis" }] },
    });
  });

  it("renvoie une erreur 500 générique pour une erreur inconnue", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reponse = reponseErreur(new Error("pile interne"));
    expect(reponse.status).toBe(500);
    const corps = (await reponse.json()) as { erreur: { code: string; message: string } };
    expect(corps.erreur.code).toBe("INTERNE");
    expect(corps.erreur.message).not.toContain("pile interne");
  });

  it("répond pour une ressource d'autrui exactement comme pour une ressource inexistante", async () => {
    const autrui = reponseErreur(erreurs.ressourceAutrui("Classe"));
    const inexistante = reponseErreur(erreurs.introuvable("Classe"));
    expect(autrui.status).toBe(404);
    expect(await autrui.json()).toEqual(await inexistante.json());
  });
});

describe("reponseOk", () => {
  it("renvoie les données en JSON, sans cache", async () => {
    const reponse = reponseOk({ ok: true }, 201);
    expect(reponse.status).toBe(201);
    expect(reponse.headers.get("cache-control")).toBe("no-store");
    await expect(reponse.json()).resolves.toEqual({ ok: true });
  });
});

describe("lireCorpsJson", () => {
  const schema = z.strictObject({ code: z.string().length(6) });

  it("valide et renvoie le corps", async () => {
    await expect(lireCorpsJson(requeteJson('{"code":"K7M4QP"}'), schema, "Code")).resolves.toEqual({
      code: "K7M4QP",
    });
  });

  it("accepte un paramètre de jeu de caractères", async () => {
    await expect(
      lireCorpsJson(requeteJson('{"code":"K7M4QP"}', "application/json; charset=utf-8"), schema, "Code"),
    ).resolves.toEqual({ code: "K7M4QP" });
  });

  it("refuse un autre type de contenu", async () => {
    await expect(
      lireCorpsJson(requeteJson('{"code":"K7M4QP"}', "text/plain"), schema, "Code"),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Le corps de la requête doit être au format JSON.",
    });
  });

  it("refuse un JSON invalide", async () => {
    await expect(lireCorpsJson(requeteJson("{"), schema, "Code")).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Le corps de la requête n'est pas un JSON valide.",
    });
  });

  it("refuse un corps trop volumineux", async () => {
    await expect(lireCorpsJson(requeteJson('{"code":"K7M4QP"}'), schema, "Code", 8)).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Le corps de la requête est trop volumineux.",
    });
  });

  it("refuse un champ inconnu", async () => {
    await expect(
      lireCorpsJson(requeteJson('{"code":"K7M4QP","extra":1}'), schema, "Code"),
    ).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("refuse un corps absent", async () => {
    const requete = new Request("http://localhost/api/essai", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    await expect(lireCorpsJson(requete, schema, "Code")).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

function requeteBinaire(corps: BodyInit | null, entetes: Record<string, string>): Request {
  return new Request("http://localhost/api/essai", { method: "POST", headers: entetes, body: corps });
}

describe("lireCorpsBinaire", () => {
  const TROP_LOURD = "Image trop lourde : 5 Mo au maximum.";

  it("renvoie les octets d'un corps application/octet-stream", async () => {
    const requete = requeteBinaire(new Uint8Array([1, 2, 3]), { "content-type": "application/octet-stream" });
    expect(Array.from(await lireCorpsBinaire(requete, 10, TROP_LOURD))).toEqual([1, 2, 3]);
  });

  it.each(["multipart/form-data; boundary=x", "text/plain", "image/png", ""])(
    "refuse le type « %s » (une page tierce pourrait l'envoyer sans requête préalable)",
    async (type) => {
      const requete = requeteBinaire(new Uint8Array([1]), type ? { "content-type": type } : {});
      await expect(lireCorpsBinaire(requete, 10, TROP_LOURD)).rejects.toMatchObject({
        code: "VALIDATION",
        message: "Le corps de la requête doit être envoyé en application/octet-stream.",
      });
    },
  );

  it("refuse une taille annoncée trop grande avant de lire le corps", async () => {
    const requete = requeteBinaire(new Uint8Array([1]), {
      "content-type": "application/octet-stream",
      "content-length": "11",
    });
    await expect(lireCorpsBinaire(requete, 10, TROP_LOURD)).rejects.toMatchObject({ message: TROP_LOURD });
  });

  it("refuse un corps plus long que la limite, même sans taille annoncée", async () => {
    const requete = requeteBinaire(new Uint8Array(11), { "content-type": "application/octet-stream" });
    await expect(lireCorpsBinaire(requete, 10, TROP_LOURD)).rejects.toMatchObject({ message: TROP_LOURD });
  });

  it("renvoie un tableau vide pour un corps absent", async () => {
    const requete = requeteBinaire(null, { "content-type": "application/octet-stream" });
    expect((await lireCorpsBinaire(requete, 10, TROP_LOURD)).byteLength).toBe(0);
  });
});

describe("reponseImage", () => {
  it("sert une image WebP jamais interprétée ni mise en cache partagé", async () => {
    const reponse = reponseImage(new Uint8Array([1, 2]));
    expect(reponse.status).toBe(200);
    expect(Object.fromEntries(reponse.headers)).toMatchObject({
      "content-type": "image/webp",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "content-disposition": "inline",
    });
    expect(Array.from(new Uint8Array(await reponse.arrayBuffer()))).toEqual([1, 2]);
  });
});

describe("reponseFichier", () => {
  it("sert un téléchargement privé, jamais interprété", async () => {
    const reponse = reponseFichier(new Uint8Array([1, 2, 3]), {
      nom: "resultats-algo-2026-09-29.csv",
      type: "text/csv; charset=utf-8",
    });
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(reponse.headers.get("content-disposition")).toBe(
      "attachment; filename=\"resultats-algo-2026-09-29.csv\"; filename*=UTF-8''resultats-algo-2026-09-29.csv",
    );
    expect(reponse.headers.get("cache-control")).toBe("private, no-store");
    expect(reponse.headers.get("x-content-type-options")).toBe("nosniff");
    expect([...new Uint8Array(await reponse.arrayBuffer())]).toEqual([1, 2, 3]);
  });

  it("refuse un nom de fichier hors de [a-z0-9.-]", () => {
    expect(() => reponseFichier(new Uint8Array(), { nom: 'a"b.csv', type: "text/csv" })).toThrow();
  });
});
