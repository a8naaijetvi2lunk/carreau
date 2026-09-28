import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appliquerFichierEnv } from "./env-fichier";

const CLES = ["CARREAU_ESSAI_A", "CARREAU_ESSAI_B"];

describe("appliquerFichierEnv", () => {
  let dossier: string | undefined;

  afterEach(() => {
    for (const cle of CLES) delete process.env[cle];
    if (dossier) rmSync(dossier, { recursive: true, force: true });
    dossier = undefined;
  });

  it("applique .env sans jamais lire .env.local", () => {
    dossier = mkdtempSync(path.join(os.tmpdir(), "carreau-env-"));
    writeFileSync(path.join(dossier, ".env"), "CARREAU_ESSAI_A=depuis_env\n");
    writeFileSync(path.join(dossier, ".env.local"), "CARREAU_ESSAI_A=depuis_local\nCARREAU_ESSAI_B=local\n");
    appliquerFichierEnv(path.join(dossier, ".env"));
    expect(process.env.CARREAU_ESSAI_A).toBe("depuis_env");
    expect(process.env.CARREAU_ESSAI_B).toBeUndefined();
  });

  it("laisse la priorité aux variables déjà posées", () => {
    dossier = mkdtempSync(path.join(os.tmpdir(), "carreau-env-"));
    writeFileSync(path.join(dossier, ".env"), "CARREAU_ESSAI_A=depuis_env\n");
    process.env.CARREAU_ESSAI_A = "depuis_terminal";
    appliquerFichierEnv(path.join(dossier, ".env"));
    expect(process.env.CARREAU_ESSAI_A).toBe("depuis_terminal");
  });

  it("ne fait rien sans fichier", () => {
    expect(() => appliquerFichierEnv(path.join(os.tmpdir(), "inexistant-carreau", ".env"))).not.toThrow();
  });
});
