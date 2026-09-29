import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { classeurXlsx } from "@/test/classes";
import { verifierArchive } from "./archive";
import { decoderTexte, detecterSeparateur, lireSource, lireTexteTabulaire } from "./lecture";
import { MAX_DECOMPRESSE_OCTETS, MESSAGES_IMPORT, TAILLE_MAX_IMPORT_OCTETS } from "./messages";

/** Octets d'un texte en Windows-1252 : ASCII tel quel, puis les octets donnés à la place des « § ». */
function octetsCp1252(modele: string, remplacements: number[]): Uint8Array {
  const octets: number[] = [];
  let i = 0;
  for (const caractere of modele) {
    octets.push(caractere === "§" ? (remplacements[i++] ?? 0x3f) : caractere.charCodeAt(0));
  }
  return Uint8Array.from(octets);
}

const fichier = (octets: Uint8Array) => ({ type: "fichier" as const, nom: "classe", octets });

describe("decoderTexte", () => {
  it("retire le BOM d'un fichier UTF-8", () => {
    const octets = Uint8Array.from([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Nom;Prénom")]);
    expect(decoderTexte(octets)).toBe("Nom;Prénom");
  });

  it("lit un CSV Windows-1252 d'Excel (é = E9, œ = 9C)", () => {
    const octets = octetsCp1252("Nom;Pr§nom\r\nC§ur;L§a", [0xe9, 0x9c, 0xe9]);
    expect(decoderTexte(octets)).toBe("Nom;Prénom\r\nCœur;Léa");
  });
});

describe("detecterSeparateur et lireTexteTabulaire", () => {
  it.each([
    ["Nom\tPrénom\nDupont\tLéa", "\t"],
    ["\n\nNom;Prénom\n\nDupont;Léa", ";"],
    ["Nom,Prénom\nDupont,Léa", ","],
    ["Nom\nDupont", ","],
  ])("séparateur de %j : %j", (texte, separateur) => {
    expect(detecterSeparateur(texte)).toBe(separateur);
  });

  it("garde une ligne du tableau par ligne du texte, lignes vides comprises", () => {
    expect(lireTexteTabulaire("Nom;Prénom\r\nDupont;Léa\r\n\r\nMartin;Inès")).toEqual([
      ["Nom", "Prénom"],
      ["Dupont", "Léa"],
      [""],
      ["Martin", "Inès"],
    ]);
  });

  it("respecte les guillemets d'un CSV à virgules", () => {
    expect(lireTexteTabulaire('Nom,Prénom\n"Dupont, fils",Léa')).toEqual([
      ["Nom", "Prénom"],
      ["Dupont, fils", "Léa"],
    ]);
  });

  it("refuse un guillemet mal fermé en donnant sa ligne", () => {
    expect(() => lireTexteTabulaire('Nom;Prénom\n"Dupont;Léa\nMartin;Inès')).toThrow(
      MESSAGES_IMPORT.guillemet(2),
    );
  });
});

describe("verifierArchive", () => {
  it("accepte un vrai classeur", async () => {
    const xlsx = await classeurXlsx([["Nom", "Prénom"]]);
    expect(() => verifierArchive(xlsx)).not.toThrow();
  });

  it("refuse une bombe de décompression, vite et sans tout décompresser", () => {
    const bombe = zipSync(
      { "xl/worksheets/sheet1.xml": new Uint8Array(MAX_DECOMPRESSE_OCTETS * 3) },
      { level: 9 },
    );
    expect(bombe.length).toBeLessThan(TAILLE_MAX_IMPORT_OCTETS);
    const debut = performance.now();
    expect(() => verifierArchive(bombe)).toThrow(MESSAGES_IMPORT.archiveTropVolumineuse);
    expect(performance.now() - debut).toBeLessThan(5_000);
  });

  it("refuse une archive de plus de 100 entrées", () => {
    const entrees = Object.fromEntries(
      Array.from({ length: 101 }, (_, i) => [`f${i}.xml`, new Uint8Array(1)]),
    );
    expect(() => verifierArchive(zipSync(entrees))).toThrow(MESSAGES_IMPORT.archiveTropVolumineuse);
  });

  it("déclare illisible une archive tronquée", async () => {
    const xlsx = await classeurXlsx([
      ["Nom", "Prénom"],
      ["Dupont", "Léa"],
    ]);
    expect(() => verifierArchive(xlsx.subarray(0, 200))).toThrow(MESSAGES_IMPORT.illisible);
  });
});

describe("lireSource", () => {
  it("lit un texte collé depuis un tableur", async () => {
    await expect(lireSource({ type: "texte", texte: "Nom\tPrénom\nDupont\tLéa" })).resolves.toEqual([
      ["Nom", "Prénom"],
      ["Dupont", "Léa"],
    ]);
  });

  it("lit un fichier CSV Windows-1252", async () => {
    await expect(
      lireSource(fichier(octetsCp1252("Nom;Pr§nom\nDupr§;L§a", [0xe9, 0xe9, 0xe9]))),
    ).resolves.toEqual([
      ["Nom", "Prénom"],
      ["Dupré", "Léa"],
    ]);
  });

  it("lit la première feuille d'un classeur XLSX, types des cellules compris", async () => {
    const xlsx = await classeurXlsx([
      ["Nom", "Prénom", "Tiers-temps"],
      ["Dupont", "Léa", true],
      ["Martin", "Inès", 0],
      ["Girard", null, "oui"],
    ]);
    await expect(lireSource(fichier(xlsx))).resolves.toEqual([
      ["Nom", "Prénom", "Tiers-temps"],
      ["Dupont", "Léa", true],
      ["Martin", "Inès", 0],
      ["Girard", null, "oui"],
    ]);
  });

  it.each([
    ["un texte vide", { type: "texte" as const, texte: " \n " }, MESSAGES_IMPORT.texteVide],
    [
      "un texte trop long",
      { type: "texte" as const, texte: "é".repeat(TAILLE_MAX_IMPORT_OCTETS / 2 + 1) },
      MESSAGES_IMPORT.tropGros,
    ],
    ["aucun fichier", fichier(new Uint8Array(0)), MESSAGES_IMPORT.fichierAbsent],
    [
      "un fichier trop gros",
      fichier(new Uint8Array(TAILLE_MAX_IMPORT_OCTETS + 1).fill(0x41)),
      MESSAGES_IMPORT.tropGros,
    ],
    [
      "un fichier .xls",
      fichier(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
      MESSAGES_IMPORT.xls,
    ],
    ["un fichier blanc", fichier(new TextEncoder().encode(" \r\n ")), MESSAGES_IMPORT.fichierVide],
    [
      "une archive qui n'est pas un classeur",
      fichier(zipSync({ "notes.txt": new TextEncoder().encode("Nom;Prénom") })),
      MESSAGES_IMPORT.illisible,
    ],
  ])("refuse %s", async (_cas, source, message) => {
    await expect(lireSource(source)).rejects.toMatchObject({ code: "VALIDATION", message });
  });
});
