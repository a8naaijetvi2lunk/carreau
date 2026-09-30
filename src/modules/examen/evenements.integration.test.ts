import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { evenement } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { EVENEMENTS_MAX_PAR_PASSAGE, MESSAGE_EVENEMENTS_INVALIDES } from "@/lib/regles-surveillance";
import { examenEnCours } from "@/test/examen";
import { INSTANT_CODE_TEST } from "@/test/sessions";
import { enregistrerEvenements } from "./evenements";
import { surveillanceDeLaSession } from "./indice";
import { validerQuestion } from "./reponses";
import { vuePassage } from "./vue";

const horloge = horlogeFixe(INSTANT_CODE_TEST);
const CHARGEMENT = "chargement-a1";

beforeEach(() => {
  horloge.fixer(INSTANT_CODE_TEST);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

function apres(depart: Date, secondes: number): Date {
  return new Date(depart.getTime() + secondes * 1000);
}

async function evenementsDe(participationId: string) {
  return db().select().from(evenement).where(eq(evenement.participationId, participationId));
}

describe("enregistrerEvenements", () => {
  it("horodate chaque événement à la réception, avec la question courante", async () => {
    const x = await examenEnCours(horloge);
    const p = x.telephones[0]?.participation.id ?? "";
    horloge.fixer(apres(x.demarreLe, 2));
    const resultat = await enregistrerEvenements(p, {
      chargement: CHARGEMENT,
      evenements: [
        { n: 1, type: "debut" },
        { n: 2, type: "masquee" },
      ],
    });
    expect(resultat).toEqual({ enregistres: 2 });
    const lignes = (await evenementsDe(p)).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    expect(lignes.map((l) => [l.type, l.sequence, l.chargement, l.questionIndex])).toEqual([
      ["debut", 1, CHARGEMENT, 0],
      ["masquee", 2, CHARGEMENT, 0],
    ]);
    expect(lignes.every((l) => l.recuLe.getTime() === apres(x.demarreLe, 2).getTime())).toBe(true);
    expect(lignes.every((l) => l.dureeMs === null)).toBe(true);
  });

  it("n'enregistre qu'une fois un lot renvoyé, ou un numéro en double dans un lot", async () => {
    const x = await examenEnCours(horloge);
    const p = x.telephones[0]?.participation.id ?? "";
    horloge.fixer(apres(x.demarreLe, 2));
    const lot = {
      chargement: CHARGEMENT,
      evenements: [
        { n: 1, type: "copie" },
        { n: 1, type: "colle" },
      ],
    };
    expect(await enregistrerEvenements(p, lot)).toEqual({ enregistres: 1 });
    expect(await enregistrerEvenements(p, lot)).toEqual({ enregistres: 0 });
    // Autre chargement de la page : mêmes numéros, autres événements.
    expect(await enregistrerEvenements(p, { ...lot, chargement: "chargement-b2" })).toEqual({
      enregistres: 1,
    });
    expect(await evenementsDe(p)).toHaveLength(2);
  });

  it("compte comme un contact : un silence précède les événements reçus après 40 s", async () => {
    const x = await examenEnCours(horloge);
    const p = x.telephones[0]?.participation.id ?? "";
    horloge.fixer(apres(x.demarreLe, 40));
    await enregistrerEvenements(p, {
      chargement: CHARGEMENT,
      evenements: [
        { n: 1, type: "masquee" },
        { n: 2, type: "visible" },
      ],
    });
    const lignes = await evenementsDe(p);
    expect(lignes.map((l) => l.type).sort()).toEqual(["masquee", "silence", "visible"]);
    expect(lignes.find((l) => l.type === "silence")?.dureeMs).toBe(40_000);
  });

  it("n'enregistre rien avant le départ ni après la fin du passage", async () => {
    const x = await examenEnCours(horloge);
    const p = x.telephones[0]?.participation.id ?? "";
    const lot = { chargement: CHARGEMENT, evenements: [{ n: 1, type: "debut" }] };
    horloge.fixer(x.demarreLe.getTime() - 1_000);
    expect(await enregistrerEvenements(p, lot)).toEqual({ enregistres: 0 });
    horloge.fixer(apres(x.demarreLe, 5));
    await validerQuestion(p, { rang: 1, selection: [] });
    await validerQuestion(p, { rang: 2, selection: [] });
    expect(await enregistrerEvenements(p, { ...lot, evenements: [{ n: 2, type: "masquee" }] })).toEqual({
      enregistres: 0,
    });
    expect(await evenementsDe(p)).toEqual([]);
  });

  it("plafonne les événements du téléphone par passage", async () => {
    const x = await examenEnCours(horloge);
    const p = x.telephones[0]?.participation.id ?? "";
    horloge.fixer(apres(x.demarreLe, 2));
    await db()
      .insert(evenement)
      .values(
        Array.from({ length: EVENEMENTS_MAX_PAR_PASSAGE - 1 }, (_, i) => ({
          participationId: p,
          type: "copie",
          recuLe: apres(x.demarreLe, 1),
          chargement: "chargement-ancien",
          sequence: i + 1,
        })),
      );
    const lot = {
      chargement: CHARGEMENT,
      evenements: [
        { n: 1, type: "colle" },
        { n: 2, type: "colle" },
      ],
    };
    expect(await enregistrerEvenements(p, lot)).toEqual({ enregistres: 1 });
    expect(await enregistrerEvenements(p, { ...lot, evenements: [{ n: 3, type: "colle" }] })).toEqual({
      enregistres: 0,
    });
  });

  it("refuse un lot mal formé", async () => {
    const x = await examenEnCours(horloge);
    const p = x.telephones[0]?.participation.id ?? "";
    const invalides: unknown[] = [
      { chargement: "court", evenements: [{ n: 1, type: "debut" }] },
      { chargement: "a b c d e f g h", evenements: [{ n: 1, type: "debut" }] },
      { chargement: CHARGEMENT, evenements: [] },
      { chargement: CHARGEMENT, evenements: [{ n: 0, type: "debut" }] },
      { chargement: CHARGEMENT, evenements: [{ n: 1.5, type: "debut" }] },
      { chargement: CHARGEMENT, evenements: [{ n: 1, type: "silence" }] },
      { chargement: CHARGEMENT, evenements: [{ n: 1, type: "debut", le: "2026-09-30T10:00:00Z" }] },
      {
        chargement: CHARGEMENT,
        evenements: Array.from({ length: 51 }, (_, i) => ({ n: i + 1, type: "copie" })),
      },
      { chargement: CHARGEMENT, evenements: [{ n: 1, type: "debut" }], duree: 3 },
    ];
    for (const lot of invalides) {
      await expect(
        enregistrerEvenements(p, lot as Parameters<typeof enregistrerEvenements>[1]),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: expect.stringContaining(MESSAGE_EVENEMENTS_INVALIDES),
      });
    }
  });
});

describe("surveillanceDeLaSession", () => {
  it("calcule l'indice de chacun, ajoute un silence en cours, et donne les faits notables", async () => {
    const x = await examenEnCours(horloge);
    const [lea, sacha, hugo] = x.telephones.map((t) => t.participation.id);
    if (!lea || !sacha || !hugo) throw new Error("participations absentes");
    horloge.fixer(apres(x.demarreLe, 2));
    await enregistrerEvenements(lea, { chargement: CHARGEMENT, evenements: [{ n: 1, type: "masquee" }] });
    horloge.fixer(apres(x.demarreLe, 10));
    await enregistrerEvenements(lea, { chargement: CHARGEMENT, evenements: [{ n: 2, type: "visible" }] });
    await enregistrerEvenements(sacha, { chargement: CHARGEMENT, evenements: [{ n: 1, type: "copie" }] });
    horloge.fixer(apres(x.demarreLe, 12));
    await vuePassage(lea);
    await vuePassage(sacha);
    // Hugo ne donne plus signe de vie depuis le départ : 20 s à l'instant du suivi (Léa et Sacha : 8 s).
    const suivi = await surveillanceDeLaSession(db(), x.session.id, apres(x.demarreLe, 20));
    expect(suivi.get(lea)).toMatchObject({ indice: 8, deconnecte: false });
    expect(suivi.get(lea)?.faits.map((f) => [f.type, f.dureeMs])).toEqual([["sortie", 8_000]]);
    expect(suivi.get(sacha)).toMatchObject({ indice: 10, deconnecte: false });
    expect(suivi.get(sacha)?.faits.map((f) => f.type)).toEqual(["presse_papiers"]);
    expect(suivi.get(hugo)).toMatchObject({ indice: 20, deconnecte: true });
    expect(suivi.get(hugo)?.faits.map((f) => [f.type, f.dureeMs])).toEqual([["sortie", 20_000]]);
    // Rien n'a été écrit pour le silence en cours de Hugo.
    expect(await evenementsDe(hugo)).toEqual([]);
  });

  it("ne donne aucun indice avant le départ", async () => {
    const x = await examenEnCours(horloge);
    const suivi = await surveillanceDeLaSession(db(), x.session.id, new Date(x.demarreLe.getTime() - 1_000));
    expect([...suivi.values()].every((s) => s.indice === null && s.faits.length === 0 && !s.deconnecte)).toBe(
      true,
    );
  });
});

describe("bandeau de sortie (D15)", () => {
  it("donne la dernière sortie d'au moins 2 s, pendant 30 s", async () => {
    const x = await examenEnCours(horloge);
    const p = x.telephones[0]?.participation.id ?? "";
    horloge.fixer(apres(x.demarreLe, 2));
    await enregistrerEvenements(p, { chargement: CHARGEMENT, evenements: [{ n: 1, type: "masquee" }] });
    horloge.fixer(apres(x.demarreLe, 40));
    await enregistrerEvenements(p, { chargement: CHARGEMENT, evenements: [{ n: 2, type: "visible" }] });
    const vue = await vuePassage(p);
    if (vue?.etape !== "question") throw new Error("question attendue");
    expect(vue.sortieNotee).toEqual({ dureeS: 38 });
    // Le téléphone continue d'interroger (toutes les 5 à 10 s) : aucun nouveau silence.
    for (const s of [50, 60]) {
      horloge.fixer(apres(x.demarreLe, s));
      await vuePassage(p);
    }
    horloge.fixer(apres(x.demarreLe, 71));
    const plusTard = await vuePassage(p);
    if (plusTard?.etape !== "question") throw new Error("question attendue");
    expect(plusTard.sortieNotee).toBeNull();
  });
});
