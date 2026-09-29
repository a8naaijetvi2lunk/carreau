import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { acteurCourant } from "@/modules/auth";
import { validerQuestion } from "@/modules/examen";
import { televerserImage } from "@/modules/images";
import { nomsCookiesEntree } from "@/modules/sessions";
import { acteurDe, creerUtilisateur } from "@/test/comptes";
import { examenEnCours, questionDuRang } from "@/test/examen";
import { imagePng, utiliserDossierImagesTemporaire } from "@/test/images";
import { INSTANT_CODE_TEST } from "@/test/sessions";
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

  it("sans session enseignante ni téléphone en examen : 404", async () => {
    vi.mocked(acteurCourant).mockResolvedValue(null);
    expect((await lire(randomUUID())).status).toBe(404);
  });
});

describe("GET /api/images/[imageId] par le téléphone d'un étudiant", () => {
  const horloge = horlogeFixe(INSTANT_CODE_TEST);
  beforeEach(() => {
    horloge.fixer(INSTANT_CODE_TEST);
    definirHorlogePourLesTests(horloge);
    vi.mocked(acteurCourant).mockResolvedValue(null);
  });
  afterEach(() => definirHorlogePourLesTests());

  function lireDepuis(imageId: string, jeton: string) {
    const cookie = `${nomsCookiesEntree().appareil}=${jeton}`;
    return GET(new Request(`http://localhost/api/images/${imageId}`, { headers: { cookie } }), {
      params: Promise.resolve({ imageId }),
    });
  }

  /** Deux questions illustrées : l'une par l'énoncé (A), l'autre par une réponse (B). */
  async function examenIllustre() {
    const auteur = acteurDe(await creerUtilisateur());
    const a = await televerserImage(auteur, { octets: await imagePng() });
    const b = await televerserImage(auteur, { octets: await imagePng() });
    const x = await examenEnCours(horloge, {
      etudiants: [{ nom: "Dupont", prenom: "Léa" }],
      questions: [
        { enonce: "Illustrée", imageId: a.id },
        {
          enonce: "Réponse illustrée",
          propositions: [
            { texte: "Image", imageId: b.id, correcte: true },
            { texte: "Texte", correcte: false },
          ],
        },
      ],
    });
    const lea = x.telephones[0];
    if (!lea) throw new Error("téléphone absent");
    const premiere = (await questionDuRang(lea.participation.id, 1)).enonce === "Illustrée" ? a.id : b.id;
    const seconde = premiere === a.id ? b.id : a.id;
    return { ...x, lea, premiere, seconde };
  }

  it("sert l'image de la question courante, jamais celle de la suivante", async () => {
    const x = await examenIllustre();
    expect((await lireDepuis(x.premiere, x.lea.jeton)).status).toBe(200);
    expect((await lireDepuis(x.seconde, x.lea.jeton)).status).toBe(404);
  });

  it("suit la question courante, puis ne sert plus rien après la fin", async () => {
    const x = await examenIllustre();
    await validerQuestion(x.lea.participation.id, { rang: 1, selection: [] });
    expect((await lireDepuis(x.premiere, x.lea.jeton)).status).toBe(404);
    expect((await lireDepuis(x.seconde, x.lea.jeton)).status).toBe(200);
    await validerQuestion(x.lea.participation.id, { rang: 2, selection: [] });
    expect((await lireDepuis(x.seconde, x.lea.jeton)).status).toBe(404);
  });

  it("ne sert rien avant le départ commun ni à un jeton inconnu", async () => {
    const x = await examenIllustre();
    expect((await lireDepuis(x.premiere, "jeton-inconnu")).status).toBe(404);
    horloge.fixer(x.demarreLe.getTime() - 1);
    expect((await lireDepuis(x.premiere, x.lea.jeton)).status).toBe(404);
  });
});
