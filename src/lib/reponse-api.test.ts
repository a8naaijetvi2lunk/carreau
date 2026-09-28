import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { erreurs } from "./erreurs";
import { lireCorpsJson, reponseErreur, reponseOk } from "./reponse-api";

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
