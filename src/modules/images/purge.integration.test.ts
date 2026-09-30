import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { image, sessionExamen } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe, maintenant } from "@/lib/horloge";
import type { ContenuSession } from "@/lib/instantane";
import { creerClasseTest } from "@/test/classes";
import { creerUtilisateur } from "@/test/comptes";
import { creerImageTest, utiliserDossierImagesTemporaire } from "@/test/images";
import { creerQcmTest, creerQuestionTest } from "@/test/qcm";
import { creerSessionTest } from "@/test/sessions";
import { purgerImagesOrphelines } from "./purge";

const DEBUT = Date.parse("2026-09-30T02:30:00.000Z");
const HEURE = 60 * 60 * 1000;
const horloge = horlogeFixe(DEBUT);
const dossier = utiliserDossierImagesTemporaire();

beforeEach(() => {
  horloge.fixer(DEBUT);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

/** Fichier du dossier des images, daté de `age` ms avant DEBUT. */
async function fichierAge(nom: string, age: number): Promise<string> {
  const chemin = path.join(dossier(), nom);
  await writeFile(chemin, "x");
  const date = new Date(DEBUT - age);
  await utimes(chemin, date, date);
  return chemin;
}

/** Ligne `image` créée `age` ms avant DEBUT, avec son fichier daté de la même façon. */
async function imageAgee(enseignantId: string, age: number) {
  horloge.fixer(DEBUT - age);
  const ligne = await creerImageTest(enseignantId);
  horloge.fixer(DEBUT);
  await fichierAge(`${ligne.id}.webp`, age);
  return ligne;
}

async function existe(id: string): Promise<boolean> {
  return (await db().select({ id: image.id }).from(image).where(eq(image.id, id))).length === 1;
}

describe("purgerImagesOrphelines (décision D3 du plan du lot 10)", () => {
  it("supprime une image que rien ne cite depuis plus de 24 h : ligne, puis fichier", async () => {
    const enseignant = await creerUtilisateur();
    const vieille = await imageAgee(enseignant.id, 25 * HEURE);
    expect(await purgerImagesOrphelines(maintenant())).toEqual({ lignes: 1, fichiers: 1, temporaires: 0 });
    expect(await existe(vieille.id)).toBe(false);
    expect(existsSync(path.join(dossier(), `${vieille.id}.webp`))).toBe(false);
  });

  it("laisse 24 h à une image tout juste téléversée", async () => {
    const enseignant = await creerUtilisateur();
    const recente = await imageAgee(enseignant.id, 23 * HEURE);
    expect(await purgerImagesOrphelines(maintenant())).toEqual({ lignes: 0, fichiers: 0, temporaires: 0 });
    expect(await existe(recente.id)).toBe(true);
    expect(existsSync(path.join(dossier(), `${recente.id}.webp`))).toBe(true);
  });

  it("garde une image citée par une question ou par une proposition", async () => {
    const enseignant = await creerUtilisateur();
    const qcm = await creerQcmTest(enseignant.id);
    const deQuestion = await imageAgee(enseignant.id, 48 * HEURE);
    const deProposition = await imageAgee(enseignant.id, 48 * HEURE);
    await creerQuestionTest(qcm.id, { imageId: deQuestion.id });
    await creerQuestionTest(qcm.id, {
      propositions: [
        { texte: "Oui", correcte: true, imageId: deProposition.id },
        { texte: "Non", correcte: false },
      ],
    });
    expect((await purgerImagesOrphelines(maintenant())).lignes).toBe(0);
    expect(await existe(deQuestion.id)).toBe(true);
    expect(await existe(deProposition.id)).toBe(true);
  });

  it("garde une image citée seulement par l'instantané d'une session", async () => {
    const enseignant = await creerUtilisateur();
    const classe = await creerClasseTest(enseignant.id);
    const qcm = await creerQcmTest(enseignant.id);
    const session = await creerSessionTest(enseignant.id, qcm.id, classe.id, {
      statut: "terminee",
      termineLe: maintenant(),
    });
    const figee = await imageAgee(enseignant.id, 48 * HEURE);
    const figeeProposition = await imageAgee(enseignant.id, 48 * HEURE);
    const contenu = {
      version: 1,
      titre: "Instantané de test",
      questions: [
        {
          image: { id: figee.id, largeur: 640, hauteur: 480 },
          propositions: [
            { texte: "Oui", image: null, correcte: true },
            { texte: "Non", image: { id: figeeProposition.id, largeur: 640, hauteur: 480 }, correcte: false },
          ],
        },
      ],
    } as unknown as ContenuSession;
    await db().update(sessionExamen).set({ contenu }).where(eq(sessionExamen.id, session.id));
    expect((await purgerImagesOrphelines(maintenant())).lignes).toBe(0);
    expect(await existe(figee.id)).toBe(true);
    expect(await existe(figeeProposition.id)).toBe(true);
  });

  it("supprime les fichiers sans ligne et les téléversements interrompus de plus de 24 h, rien d'autre", async () => {
    const sansLigne = await fichierAge(`${randomUUID()}.webp`, 25 * HEURE);
    const sansLigneRecent = await fichierAge(`${randomUUID()}.webp`, HEURE);
    const interrompu = await fichierAge(`.televersement-${randomUUID()}.tmp`, 25 * HEURE);
    const autre = await fichierAge("notes.txt", 100 * HEURE);
    expect(await purgerImagesOrphelines(maintenant())).toEqual({ lignes: 0, fichiers: 1, temporaires: 1 });
    expect(existsSync(sansLigne)).toBe(false);
    expect(existsSync(interrompu)).toBe(false);
    expect(existsSync(sansLigneRecent)).toBe(true);
    expect(existsSync(autre)).toBe(true);
  });

  it("ne trouve plus rien à la purge suivante", async () => {
    const enseignant = await creerUtilisateur();
    await imageAgee(enseignant.id, 30 * HEURE);
    expect((await purgerImagesOrphelines(maintenant())).lignes).toBe(1);
    expect(await purgerImagesOrphelines(maintenant())).toEqual({ lignes: 0, fichiers: 0, temporaires: 0 });
  });
});
