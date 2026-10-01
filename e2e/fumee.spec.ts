import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { URL_E2E } from "./outils/env";

test.describe("fumée", () => {
  test("le serveur de test passe les contrôles de fumée (décision D10 du plan du lot 10)", async () => {
    // Contrôles sans navigateur : une seule fois, sur le projet « ordinateur ».
    test.skip(test.info().project.name !== "ordinateur", "Contrôles HTTP : une seule fois.");
    // Repli (noté au rapport de la tâche 6) : Playwright transpile ce fichier en CommonJS et ne
    // charge pas l'import ESM de scripts/fumee.mjs (« Cannot use 'import.meta' outside a module »).
    // Le script est donc lancé comme process, à l'image de creerLienSuperAdmin (admin-creer.mjs) ;
    // une sortie non nulle (un contrôle en échec) lève, execFileSync jetant sur un code de sortie non nul.
    const sortie = execFileSync(process.execPath, ["scripts/fumee.mjs", URL_E2E], { encoding: "utf8" });
    const lignes = sortie.trim().split("\n");
    expect(lignes.filter((ligne) => ligne.startsWith("ÉCHEC"))).toEqual([]);
    expect(lignes.filter((ligne) => ligne.startsWith("OK"))).toHaveLength(7);
  });
});
