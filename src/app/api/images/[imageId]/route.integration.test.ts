import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acteurCourant } from "@/modules/auth";
import { televerserImage } from "@/modules/images";
import { acteurDe, creerUtilisateur } from "@/test/comptes";
import { imagePng, utiliserDossierImagesTemporaire } from "@/test/images";
import { GET } from "./route";

vi.mock("@/modules/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/auth")>()),
  acteurCourant: vi.fn(),
}));

utiliserDossierImagesTemporaire();

afterEach(() => vi.mocked(acteurCourant).mockReset());

function lire(imageId: string) {
  return GET(new Request(`http://localhost/api/images/${imageId}`), { params: Promise.resolve({ imageId }) });
}

describe("GET /api/images/[imageId]", () => {
  it("sert l'image WebP à son propriétaire, avec les en-têtes de sécurité", async () => {
    const proprietaire = acteurDe(await creerUtilisateur());
    const vue = await televerserImage(proprietaire, { octets: await imagePng() });
    vi.mocked(acteurCourant).mockResolvedValue(proprietaire);
    const reponse = await lire(vue.id);
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("content-type")).toBe("image/webp");
    expect(reponse.headers.get("x-content-type-options")).toBe("nosniff");
    expect(reponse.headers.get("cache-control")).toBe("private, no-store");
    expect((await reponse.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("répond 404 pour l'image d'un autre compte, comme pour une image inconnue", async () => {
    const proprietaire = acteurDe(await creerUtilisateur());
    const vue = await televerserImage(proprietaire, { octets: await imagePng() });
    vi.mocked(acteurCourant).mockResolvedValue(acteurDe(await creerUtilisateur()));
    const autrui = await lire(vue.id);
    const inconnue = await lire(randomUUID());
    expect(autrui.status).toBe(404);
    expect(await autrui.json()).toEqual(await inconnue.json());
  });

  it("refuse un visiteur non connecté (401)", async () => {
    vi.mocked(acteurCourant).mockResolvedValue(null);
    expect((await lire(randomUUID())).status).toBe(401);
  });
});
