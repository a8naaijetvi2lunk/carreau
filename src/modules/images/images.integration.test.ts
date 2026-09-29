import { randomUUID } from "node:crypto";
import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { image, journal } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { MAX_IMAGES_PAR_COMPTE, MESSAGES_IMAGE, TAILLE_MAX_IMAGE_OCTETS } from "@/lib/images";
import { lireImage, televerserImage, verifierImagesDeLActeur } from "@/modules/images";
import { acteurDe, creerUtilisateur } from "@/test/comptes";
import { creerImageTest, imagePng, utiliserDossierImagesTemporaire } from "@/test/images";

const dossier = utiliserDossierImagesTemporaire();
const DEBUT = Date.parse("2026-09-29T08:00:00.000Z");

beforeEach(() => definirHorlogePourLesTests(horlogeFixe(DEBUT)));
afterEach(async () => {
  definirHorlogePourLesTests();
  for (const nom of await readdir(dossier())) await rm(path.join(dossier(), nom), { force: true });
});

async function acteur(): Promise<ActeurUtilisateur> {
  return acteurDe(await creerUtilisateur());
}

async function journalDe(acteurId: string, action: string) {
  return db()
    .select()
    .from(journal)
    .where(and(eq(journal.acteurId, acteurId), eq(journal.action, action)));
}

/** `n` lignes `image` du compte, insérées d'un coup (sans fichier). */
async function remplir(enseignantId: string, n: number): Promise<void> {
  await db()
    .insert(image)
    .values(
      Array.from({ length: n }, () => ({
        id: randomUUID(),
        enseignantId,
        largeur: 10,
        hauteur: 10,
        octets: 10,
        creeLe: new Date(DEBUT),
      })),
    );
}

describe("televerserImage", () => {
  it("enregistre l'image ré-encodée, sa ligne et une entrée de journal sans nom de fichier", async () => {
    const a = await acteur();
    const vue = await televerserImage(a, { octets: await imagePng({ largeur: 320, hauteur: 200 }) });
    expect(vue).toMatchObject({ largeur: 320, hauteur: 200 });
    const fichier = await readFile(path.join(dossier(), `${vue.id}.webp`));
    const [ligne] = await db().select().from(image).where(eq(image.id, vue.id));
    expect(ligne).toMatchObject({
      enseignantId: a.id,
      largeur: 320,
      hauteur: 200,
      octets: fichier.byteLength,
    });
    const [entree] = await journalDe(a.id, "images.televerser");
    expect(entree).toMatchObject({
      cible: `image:${vue.id}`,
      details: { octets: fichier.byteLength, largeur: 320, hauteur: 200 },
    });
    expect(await readdir(dossier())).toEqual([`${vue.id}.webp`]);
  });

  it("refuse un fichier vide ou de plus de 5 Mo, sans rien écrire", async () => {
    const a = await acteur();
    await expect(televerserImage(a, { octets: new Uint8Array() })).rejects.toMatchObject({
      code: "VALIDATION",
      message: MESSAGES_IMAGE.vide,
    });
    await expect(
      televerserImage(a, { octets: new Uint8Array(TAILLE_MAX_IMAGE_OCTETS + 1) }),
    ).rejects.toMatchObject({ code: "VALIDATION", message: MESSAGES_IMAGE.tropLourde });
    expect(await readdir(dossier())).toEqual([]);
    expect(await db().select().from(image).where(eq(image.enseignantId, a.id))).toEqual([]);
  });

  it("refuse un fichier qui n'est pas une image acceptée, sans rien écrire", async () => {
    const a = await acteur();
    await expect(
      televerserImage(a, { octets: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>') }),
    ).rejects.toMatchObject({ code: "VALIDATION", message: MESSAGES_IMAGE.format });
    expect(await readdir(dossier())).toEqual([]);
  });

  it(`refuse une ${MAX_IMAGES_PAR_COMPTE + 1}e image`, async () => {
    const a = await acteur();
    await remplir(a.id, MAX_IMAGES_PAR_COMPTE);
    await expect(televerserImage(a, { octets: await imagePng() })).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_IMAGE.limite,
    });
    expect(await readdir(dossier())).toEqual([]);
  });

  it("tient la limite quand deux envois arrivent ensemble à la dernière place", async () => {
    const a = await acteur();
    await remplir(a.id, MAX_IMAGES_PAR_COMPTE - 1);
    const octets = await imagePng();
    const resultats = await Promise.allSettled([
      televerserImage(a, { octets }),
      televerserImage(a, { octets }),
    ]);
    expect(resultats.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultats.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "ETAT", message: MESSAGES_IMAGE.limite },
    });
    expect((await readdir(dossier())).filter((nom) => nom.endsWith(".webp"))).toHaveLength(1);
  });

  it("supprime le fichier si la ligne ne peut pas être insérée", async () => {
    const a = await acteur();
    // Compte inexistant : la clé étrangère refuse l'insertion, après l'écriture du fichier.
    const fantome = { ...a, id: randomUUID() };
    await expect(televerserImage(fantome, { octets: await imagePng() })).rejects.toThrow();
    expect(await readdir(dossier())).toEqual([]);
  });
});

describe("lireImage", () => {
  it("rend le fichier de l'image à son propriétaire", async () => {
    const a = await acteur();
    const vue = await televerserImage(a, { octets: await imagePng() });
    const { contenu } = await lireImage(a, { imageId: vue.id });
    expect(contenu.equals(await readFile(path.join(dossier(), `${vue.id}.webp`)))).toBe(true);
  });

  it("répond « introuvable » pour l'image d'un autre compte et journalise le refus", async () => {
    const a = await acteur();
    const b = await acteur();
    const vue = await televerserImage(a, { octets: await imagePng() });
    await expect(lireImage(b, { imageId: vue.id })).rejects.toMatchObject({
      code: "INTROUVABLE",
      message: "Image introuvable.",
    });
    const [refus] = await journalDe(b.id, "acces.refus");
    expect(refus?.details).toEqual({ action: "images.lire", role: "enseignant", motif: "ressource_autrui" });
  });

  it("répond « introuvable » sans journal pour un identifiant mal formé ou inconnu", async () => {
    const a = await acteur();
    await expect(lireImage(a, { imageId: "../../etc/passwd" })).rejects.toMatchObject({
      code: "INTROUVABLE",
    });
    await expect(lireImage(a, { imageId: randomUUID() })).rejects.toMatchObject({ code: "INTROUVABLE" });
    expect(await journalDe(a.id, "acces.refus")).toEqual([]);
  });

  it("répond « introuvable » quand le fichier manque sur le disque", async () => {
    const a = await acteur();
    const ligne = await creerImageTest(a.id);
    await expect(lireImage(a, { imageId: ligne.id })).rejects.toMatchObject({ code: "INTROUVABLE" });
  });
});

describe("verifierImagesDeLActeur", () => {
  it("accepte ses propres images et une liste vide", async () => {
    const a = await acteur();
    const i1 = await creerImageTest(a.id);
    const i2 = await creerImageTest(a.id);
    await expect(verifierImagesDeLActeur(db(), a, [i1.id, i2.id, i1.id])).resolves.toBeUndefined();
    await expect(verifierImagesDeLActeur(db(), a, [])).resolves.toBeUndefined();
  });

  it("refuse l'image d'un autre compte comme une image inconnue", async () => {
    const a = await acteur();
    const b = await acteur();
    const autre = await creerImageTest(b.id);
    await expect(verifierImagesDeLActeur(db(), a, [autre.id])).rejects.toMatchObject({
      code: "INTROUVABLE",
      message: "Image introuvable.",
      refusAcces: true,
    });
    await expect(verifierImagesDeLActeur(db(), a, [randomUUID()])).rejects.toMatchObject({
      code: "INTROUVABLE",
      refusAcces: false,
    });
    await expect(verifierImagesDeLActeur(db(), a, ["pas-un-uuid"])).rejects.toMatchObject({
      code: "INTROUVABLE",
      refusAcces: false,
    });
  });
});
