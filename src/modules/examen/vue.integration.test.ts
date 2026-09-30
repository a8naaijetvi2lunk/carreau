import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { sessionExamen } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { examenEnCours, passageEnBase, poserBrouillon, questionDuRang } from "@/test/examen";
import { INSTANT_CODE_TEST } from "@/test/sessions";
import { validerQuestion } from "./reponses";
import { vuePassage } from "./vue";

const horloge = horlogeFixe(INSTANT_CODE_TEST);

beforeEach(() => {
  horloge.fixer(INSTANT_CODE_TEST);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

/** Deux questions aux énoncés et réponses distincts : « Capitale ? » (Paris juste) et « Couleur ? » (Bleu juste). */
const QUESTIONS = {
  questions: [
    {
      enonce: "Capitale ?",
      propositions: [
        { texte: "Paris", correcte: true },
        { texte: "Lyon", correcte: false },
        { texte: "Nice", correcte: false },
      ],
    },
    {
      enonce: "Couleur ?",
      propositions: [
        { texte: "Bleu", correcte: true },
        { texte: "Rouge", correcte: false },
      ],
    },
  ],
};

describe("vuePassage", () => {
  it("ne sert que la question courante, dans l'ordre de l'étudiant, sans bonne réponse", async () => {
    const x = await examenEnCours(horloge, QUESTIONS);
    const p = x.telephones[0]?.participation.id ?? "";
    const vue = await vuePassage(p);
    if (vue?.etape !== "question") throw new Error("question attendue");
    const attendue = await questionDuRang(p, 1);
    const autre = await questionDuRang(p, 2);
    expect(vue.question).toMatchObject({ rang: 1, total: 2, type: "unique", enonce: attendue.enonce });
    const ordre = (await passageEnBase(p)).ordre?.[0]?.p ?? [];
    expect(vue.question.propositions.map((r) => r.texte)).toEqual(
      ordre.map((i) => attendue.propositions[i]?.texte),
    );
    expect(vue.question.propositions.map((r) => r.id)).toEqual(ordre.map((_, position) => String(position)));
    const json = JSON.stringify(vue);
    expect(json).not.toContain("correcte");
    expect(json).not.toContain(autre.enonce);
    expect(vue.selection).toEqual([]);
    expect(vue.echeance).toBe(new Date(x.demarreLe.getTime() + 1_200_000).toISOString());
    expect(vue.sortieNotee).toBeNull();
  });

  it("rend le brouillon en positions affichées", async () => {
    const x = await examenEnCours(horloge, QUESTIONS);
    const p = x.telephones[0]?.participation.id ?? "";
    const premiere = await questionDuRang(p, 1);
    const juste = premiere.propositions.find((r) => r.correcte)?.texte ?? "";
    await poserBrouillon(p, 1, [juste]);
    const vue = await vuePassage(p);
    if (vue?.etape !== "question") throw new Error("question attendue");
    const position = vue.question.propositions.findIndex((r) => r.texte === juste);
    expect(vue.selection).toEqual([String(position)]);
  });

  it("ne sert rien avant le départ commun", async () => {
    const x = await examenEnCours(horloge, QUESTIONS);
    horloge.fixer(x.demarreLe.getTime() - 1);
    expect(await vuePassage(x.telephones[0]?.participation.id ?? "")).toBeNull();
  });

  it("rend l'écran de fin : réponses, durée, note si elle est visible", async () => {
    const x = await examenEnCours(horloge, QUESTIONS);
    const p = x.telephones[0]?.participation.id ?? "";
    horloge.fixer(x.demarreLe.getTime() + 42_000);
    const premiere = await questionDuRang(p, 1);
    const juste = premiere.propositions.find((r) => r.correcte)?.texte ?? "";
    const vue = await vuePassage(p);
    if (vue?.etape !== "question") throw new Error("question attendue");
    const id = String(vue.question.propositions.findIndex((r) => r.texte === juste));
    await validerQuestion(p, { rang: 1, selection: [id] });
    await validerQuestion(p, { rang: 2, selection: [] });
    expect(await vuePassage(p)).toEqual({
      etape: "fin",
      enregistreesLe: new Date(x.demarreLe.getTime() + 42_000).toISOString(),
      repondues: 1,
      total: 2,
      dureeS: 42,
      note: 10,
      correction: false,
    });
    await db().update(sessionExamen).set({ noteVisible: false }).where(eq(sessionExamen.id, x.session.id));
    expect(await vuePassage(p)).toMatchObject({ etape: "fin", note: null });
  });

  it("répond null pour une participation inconnue", async () => {
    expect(await vuePassage("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
