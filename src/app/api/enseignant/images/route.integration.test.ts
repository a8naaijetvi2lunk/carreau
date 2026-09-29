import { readdir } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acteurCourant } from "@/modules/auth";
import { acteurDe, creerUtilisateur } from "@/test/comptes";
import { imagePng, utiliserDossierImagesTemporaire } from "@/test/images";
import { POST } from "./route";

vi.mock("@/modules/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/auth")>()),
  acteurCourant: vi.fn(),
}));

const dossier = utiliserDossierImagesTemporaire();

afterEach(() => vi.mocked(acteurCourant).mockReset());

function envoi(corps: Uint8Array, type = "application/octet-stream"): Request {
  return new Request("http://localhost/api/enseignant/images", {
    method: "POST",
    headers: { "content-type": type },
    // Copie dans un Uint8Array<ArrayBuffer> concret : `imagePng()` etc. renvoient un `Uint8Array`
    // adossé à `ArrayBufferLike`, que `BodyInit` (TS 5.9 / lib.dom) n'accepte pas directement.
    body: new Uint8Array(corps),
  });
}

describe("POST /api/enseignant/images", () => {
  it("refuse un visiteur non connecté (401), sans rien écrire", async () => {
    vi.mocked(acteurCourant).mockResolvedValue(null);
    const reponse = await POST(envoi(await imagePng()));
    expect(reponse.status).toBe(401);
    expect(await readdir(dossier())).toEqual([]);
  });

  it("refuse un corps qui n'est pas en application/octet-stream (422)", async () => {
    vi.mocked(acteurCourant).mockResolvedValue(acteurDe(await creerUtilisateur()));
    const reponse = await POST(envoi(await imagePng(), "multipart/form-data; boundary=x"));
    expect(reponse.status).toBe(422);
  });

  it("enregistre l'image et renvoie son identifiant et ses dimensions (201)", async () => {
    vi.mocked(acteurCourant).mockResolvedValue(acteurDe(await creerUtilisateur()));
    const reponse = await POST(envoi(await imagePng({ largeur: 120, hauteur: 80 })));
    expect(reponse.status).toBe(201);
    expect(reponse.headers.get("cache-control")).toBe("no-store");
    const corps = (await reponse.json()) as { image: { id: string; largeur: number; hauteur: number } };
    expect(corps.image).toMatchObject({ largeur: 120, hauteur: 80 });
    expect(await readdir(dossier())).toContain(`${corps.image.id}.webp`);
  });

  it("renvoie le message d'un format refusé", async () => {
    vi.mocked(acteurCourant).mockResolvedValue(acteurDe(await creerUtilisateur()));
    const reponse = await POST(envoi(new TextEncoder().encode("<svg/>")));
    expect(reponse.status).toBe(422);
    await expect(reponse.json()).resolves.toMatchObject({
      erreur: {
        code: "VALIDATION",
        message: "Format d'image non pris en charge : utilise une image PNG, JPEG, WebP ou GIF.",
      },
    });
  });
});
