import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENV_VALIDE, appliquerEnvValide } from "@/test/env-valide";
import { env, reinitialiserEnvPourLesTests } from "./env";

const SAUVEGARDE = { ...process.env };

describe("env", () => {
  beforeEach(() => appliquerEnvValide());
  afterEach(() => {
    for (const cle of Object.keys(process.env)) if (!(cle in SAUVEGARDE)) delete process.env[cle];
    Object.assign(process.env, SAUVEGARDE);
    reinitialiserEnvPourLesTests();
  });

  it("valide un environnement complet", () => {
    expect(env()).toMatchObject({
      DATABASE_URL: ENV_VALIDE.DATABASE_URL,
      APP_URL: ENV_VALIDE.APP_URL,
      NODE_ENV: "test",
    });
  });

  it("refuse une variable obligatoire manquante en la nommant", () => {
    appliquerEnvValide({ DATABASE_URL: undefined });
    expect(() => env()).toThrow(/DATABASE_URL/);
  });

  it("refuse une clé de chiffrement qui ne fait pas 32 octets", () => {
    appliquerEnvValide({ CHIFFREMENT_CLE: Buffer.alloc(16, 1).toString("base64") });
    expect(() => env()).toThrow(/CHIFFREMENT_CLE/);
  });

  it("refuse une clé de chiffrement qui n'est pas du base64", () => {
    appliquerEnvValide({ CHIFFREMENT_CLE: "pas du base64 !" });
    expect(() => env()).toThrow(/CHIFFREMENT_CLE/);
  });

  it("refuse une URL publique qui n'est pas en http(s)", () => {
    appliquerEnvValide({ APP_URL: "ftp://exemple.test" });
    expect(() => env()).toThrow(/APP_URL/);
  });

  it("refuse un répertoire d'images vide", () => {
    appliquerEnvValide({ IMAGES_DIR: "  " });
    expect(() => env()).toThrow(/IMAGES_DIR/);
  });

  it("traite un CRON_SECRET vide comme absent", () => {
    appliquerEnvValide({ CRON_SECRET: "" });
    expect(env().CRON_SECRET).toBeUndefined();
  });

  it("refuse un CRON_SECRET contenant un espace", () => {
    appliquerEnvValide({ CRON_SECRET: `${"a".repeat(32)} b` });
    expect(() => env()).toThrow(/CRON_SECRET/);
  });

  it("refuse un CRON_SECRET trop court", () => {
    appliquerEnvValide({ CRON_SECRET: "court" });
    expect(() => env()).toThrow(/CRON_SECRET/);
  });

  it("accepte un CRON_SECRET d'au moins 32 caractères", () => {
    appliquerEnvValide({ CRON_SECRET: "a".repeat(32) });
    expect(env().CRON_SECRET).toBe("a".repeat(32));
  });

  it("mémorise le résultat jusqu'à la réinitialisation", () => {
    const premier = env();
    process.env.APP_URL = "http://autre.test";
    expect(env()).toBe(premier);
    reinitialiserEnvPourLesTests();
    expect(env().APP_URL).toBe("http://autre.test");
  });
});
