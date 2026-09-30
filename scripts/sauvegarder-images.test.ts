import { describe, expect, it } from "vitest";
import { ARCHIVES_GARDEES, archivesARetirer, nomArchive } from "./sauvegarder-images.mjs";

describe("sauvegarde des images (décision D7 du plan du lot 10)", () => {
  it("nomme l'archive d'après la date UTC", () => {
    expect(nomArchive(new Date("2026-09-30T02:45:00.000Z"))).toBe("images-2026-09-30.tar.gz");
    expect(nomArchive(new Date("2026-10-01T23:30:00.000Z"))).toBe("images-2026-10-01.tar.gz");
  });

  it("garde les 14 archives les plus récentes et ignore tout autre fichier", () => {
    expect(ARCHIVES_GARDEES).toBe(14);
    const archives = Array.from(
      { length: 16 },
      (_, i) => `images-2026-09-${String(i + 1).padStart(2, "0")}.tar.gz`,
    );
    const autres = [".images-2026-09-30.tar.gz.tmp", "notes.txt", "images-2026-9-1.tar.gz"];
    expect(archivesARetirer([...autres, ...archives].reverse()).sort()).toEqual([
      "images-2026-09-01.tar.gz",
      "images-2026-09-02.tar.gz",
    ]);
    expect(archivesARetirer(archives.slice(0, 14))).toEqual([]);
    expect(archivesARetirer(archives, 15)).toEqual(["images-2026-09-01.tar.gz"]);
  });
});
