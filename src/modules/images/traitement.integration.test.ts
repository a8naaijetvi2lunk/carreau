import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MESSAGES_IMAGE } from "@/lib/images";
import { gifAnime, imageGif, imageJpeg, imagePng, imageWebp, pngAnnoncant } from "@/test/images";
import { formatDepuisSignature } from "./signature";
import { traiterImage } from "./traitement";

describe("traiterImage", () => {
  it("ré-encode chaque format accepté en WebP, sans l'agrandir", async () => {
    for (const octets of [await imagePng(), await imageJpeg(), await imageWebp(), await imageGif()]) {
      const traitee = await traiterImage(octets);
      expect(formatDepuisSignature(traitee.contenu)).toBe("webp");
      expect(traitee).toMatchObject({ largeur: 64, hauteur: 48 });
    }
  });

  it("réduit une grande image à 1600 px sur son plus grand côté, proportions gardées", async () => {
    const traitee = await traiterImage(await imageJpeg({ largeur: 2000, hauteur: 1000 }));
    expect(traitee).toMatchObject({ largeur: 1600, hauteur: 800 });
  });

  it("applique l'orientation EXIF puis retire les métadonnées", async () => {
    const traitee = await traiterImage(await imageJpeg({ largeur: 40, hauteur: 20, orientation: 6 }));
    expect(traitee).toMatchObject({ largeur: 20, hauteur: 40 });
    const metadonnees = await sharp(traitee.contenu).metadata();
    expect(metadonnees.exif).toBeUndefined();
    expect(metadonnees.orientation).toBeUndefined();
  });

  it("refuse une image animée", async () => {
    await expect(traiterImage(await gifAnime())).rejects.toMatchObject({
      code: "VALIDATION",
      message: MESSAGES_IMAGE.animee,
    });
  });

  it.each([
    ["un SVG", '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'],
    ["un texte", "Nom;Prénom"],
  ])("refuse %s", async (_quoi, contenu) => {
    await expect(traiterImage(new TextEncoder().encode(contenu))).rejects.toMatchObject({
      code: "VALIDATION",
      message: MESSAGES_IMAGE.format,
    });
  });

  it("refuse une image dont la signature est bonne mais le contenu illisible", async () => {
    const octets = new Uint8Array([...(await imagePng()).subarray(0, 8), ...new Uint8Array(64)]);
    await expect(traiterImage(octets)).rejects.toMatchObject({
      code: "VALIDATION",
      message: MESSAGES_IMAGE.illisible,
    });
  });

  it("refuse une image de plus de 40 millions de pixels", async () => {
    await expect(traiterImage(await pngAnnoncant(8000, 6000))).rejects.toMatchObject({
      code: "VALIDATION",
      message: MESSAGES_IMAGE.illisible,
    });
  });
});
