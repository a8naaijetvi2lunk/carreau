import { afterEach, describe, expect, it, vi } from "vitest";
import { appelerApi } from "./appel-api";

afterEach(() => vi.unstubAllGlobals());

function simulerFetch(reponse: Response) {
  const faux = vi.fn<(chemin: string, init?: RequestInit) => Promise<Response>>(async () => reponse);
  vi.stubGlobal("fetch", faux);
  return faux;
}

describe("appelerApi", () => {
  it("envoie un POST JSON sans cache et rend les données d'un succès", async () => {
    const faux = simulerFetch(Response.json({ etape: "code" }));
    await expect(appelerApi("/api/etudiant/etat", {})).resolves.toEqual({
      ok: true,
      donnees: { etape: "code" },
    });
    const [chemin, init] = faux.mock.calls[0] ?? [];
    expect(chemin).toBe("/api/etudiant/etat");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      credentials: "same-origin",
      cache: "no-store",
    });
  });

  it("rend le statut et l'erreur d'un refus, détails compris", async () => {
    simulerFetch(
      Response.json(
        { erreur: { code: "ETAT", message: "Ton accès a expiré.", details: { raison: "ticket" } } },
        { status: 409 },
      ),
    );
    await expect(appelerApi("/api/etudiant/reclamer", { etudiantId: "x" })).resolves.toEqual({
      ok: false,
      statut: 409,
      erreur: { code: "ETAT", message: "Ton accès a expiré.", details: { raison: "ticket" } },
    });
  });

  it("lève sur une réponse qui ne vient pas d'une route de Carreau", async () => {
    simulerFetch(new Response("<html>502</html>", { status: 502 }));
    await expect(appelerApi("/api/etudiant/etat", {})).rejects.toThrow(
      "Réponse inattendue du serveur (502).",
    );
  });
});
