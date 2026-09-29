import { describe, expect, it } from "vitest";
import { imageGif, imageJpeg, imagePng, imageWebp } from "@/test/images";
import { formatDepuisSignature } from "./signature";

describe("formatDepuisSignature", () => {
  it("reconnaît les quatre formats acceptés sur leurs octets", async () => {
    expect(formatDepuisSignature(await imagePng())).toBe("png");
    expect(formatDepuisSignature(await imageJpeg())).toBe("jpeg");
    expect(formatDepuisSignature(await imageGif())).toBe("gif");
    expect(formatDepuisSignature(await imageWebp())).toBe("webp");
  });

  it("reconnaît les deux versions de GIF", () => {
    expect(formatDepuisSignature(new TextEncoder().encode("GIF87a......"))).toBe("gif");
    expect(formatDepuisSignature(new TextEncoder().encode("GIF89a......"))).toBe("gif");
  });

  it.each([
    ["un SVG", '<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
    ["un texte", "Nom;Prénom"],
    // Octets de taille nuls, écrits par String.fromCharCode : jamais de caractère invisible en clair.
    ["un conteneur RIFF qui n'est pas du WebP", `RIFF${String.fromCharCode(0).repeat(4)}WAVEfmt `],
    ["un fichier vide", ""],
    ["un fichier trop court", "GIF8"],
  ])("refuse %s", (_quoi, contenu) => {
    expect(formatDepuisSignature(new TextEncoder().encode(contenu))).toBeNull();
  });
});
