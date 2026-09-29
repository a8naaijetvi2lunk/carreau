import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { calculerCode, fenetreCode } from "@/moteur/code-session";
import { creerSessionTest, INSTANT_CODE_TEST, preparerSession, SECRET_CODE_TEST } from "@/test/sessions";
import { codeAffiche, sessionParCode } from "./code";

const horloge = horlogeFixe(INSTANT_CODE_TEST);

beforeEach(() => {
  horloge.fixer(INSTANT_CODE_TEST);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

describe("sessionParCode", () => {
  it("trouve la session d'un code courant ou précédent, saisi librement", async () => {
    const { session } = await preparerSession({ codeSecret: SECRET_CODE_TEST });
    expect(await sessionParCode("3pd 4y2")).toEqual({ id: session.id, statut: "attente" });
    expect(await sessionParCode("QXCPKC")).toEqual({ id: session.id, statut: "attente" });
    horloge.avancer(30_000);
    expect(await sessionParCode("QXCPKC")).toBeNull();
  });

  it("accepte le code pendant l'examen (amendement A1), jamais après la fin ou l'annulation", async () => {
    const autre = Buffer.alloc(32, 2).toString("base64url");
    const { enseignant, qcm, classe } = await preparerSession({ codeSecret: autre, statut: "en_cours" });
    expect((await sessionParCode("4Q1ME0"))?.statut).toBe("en_cours");
    await creerSessionTest(enseignant.id, qcm.id, classe.id, {
      statut: "terminee",
      codeSecret: Buffer.alloc(32, 3).toString("base64url"),
    });
    await creerSessionTest(enseignant.id, qcm.id, classe.id, {
      statut: "annulee",
      codeSecret: Buffer.alloc(32, 4).toString("base64url"),
    });
    for (const octet of [3, 4]) {
      const secret = Buffer.alloc(32, octet).toString("base64url");
      expect(await sessionParCode(calculerCode(secret, fenetreCode(new Date(INSTANT_CODE_TEST))))).toBeNull();
    }
  });

  it("ne trouve rien pour une saisie illisible ou un code inconnu", async () => {
    await preparerSession({ codeSecret: SECRET_CODE_TEST });
    expect(await sessionParCode("12")).toBeNull();
    expect(await sessionParCode("AAAAAA")).toBeNull();
  });
});

describe("codeAffiche", () => {
  it("donne le code en deux groupes, les secondes restantes, le lien du QR code et l'adresse", async () => {
    const affiche = await codeAffiche(SECRET_CODE_TEST);
    expect(affiche.code).toBe("3PD 4Y2");
    expect(affiche.secondesRestantes).toBe(10);
    expect(affiche.lien).toBe(new URL("/rejoindre#3PD4Y2", env().APP_URL).toString());
    expect(affiche.adresse).toBe(`${new URL(env().APP_URL).host}/rejoindre`);
    expect(affiche.qrCode.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
  });
});
