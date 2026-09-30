import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { participation, sessionExamen } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { MESSAGES_EXAMEN } from "@/lib/regles-examen";
import { examenEnCours, passageEnBase } from "@/test/examen";
import { INSTANT_CODE_TEST } from "@/test/sessions";
import { cloturerSiFinie, prolongerPassages } from "./passage";
import { validerQuestion } from "./reponses";

const horloge = horlogeFixe(INSTANT_CODE_TEST);

beforeEach(() => {
  horloge.fixer(INSTANT_CODE_TEST);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

function apres(depart: Date, secondes: number): Date {
  return new Date(depart.getTime() + secondes * 1000);
}

async function finPrevue(sessionId: string): Promise<number | undefined> {
  const [s] = await db()
    .select({ finPrevueLe: sessionExamen.finPrevueLe })
    .from(sessionExamen)
    .where(eq(sessionExamen.id, sessionId));
  return s?.finPrevueLe?.getTime();
}

function prolonger(sessionId: string, minutes: number, instant: Date) {
  return db().transaction((tx) => prolongerPassages(tx, sessionId, minutes, instant));
}

describe("prolongerPassages (D12)", () => {
  it("recule l'échéance globale des passages en cours et la fin prévue, pas celle d'un passage fini", async () => {
    const x = await examenEnCours(horloge);
    const [lea, sacha, hugo] = x.telephones.map((t) => t.participation.id);
    if (!lea || !sacha || !hugo) throw new Error("participations absentes");
    horloge.fixer(apres(x.demarreLe, 60));
    await validerQuestion(hugo, { rang: 1, selection: [] });
    await validerQuestion(hugo, { rang: 2, selection: [] });
    const avant = (await passageEnBase(lea)).echeanceGlobaleLe?.getTime() ?? 0;
    const finAvant = (await finPrevue(x.session.id)) ?? 0;
    expect(await prolonger(x.session.id, 5, apres(x.demarreLe, 60))).toBe(2);
    for (const p of [lea, sacha]) {
      expect((await passageEnBase(p)).echeanceGlobaleLe?.getTime()).toBe(avant + 300_000);
    }
    expect((await passageEnBase(hugo)).echeanceGlobaleLe?.getTime()).toBe(avant);
    expect(await finPrevue(x.session.id)).toBe(finAvant + 300_000);
  });

  it("rattrape d'abord : un passage dont le temps est déjà écoulé n'est pas prolongé", async () => {
    const x = await examenEnCours(horloge, { qcm: { modeChrono: "global", dureeGlobaleS: 60 } });
    const [lea, sacha] = x.telephones.map((t) => t.participation.id);
    if (!lea || !sacha) throw new Error("participations absentes");
    // Sacha a un tiers-temps figé plus long : son échéance n'est pas encore passée.
    await db()
      .update(participation)
      .set({ echeanceGlobaleLe: apres(x.demarreLe, 80) })
      .where(eq(participation.id, sacha));
    expect(await prolonger(x.session.id, 10, apres(x.demarreLe, 70))).toBe(1);
    expect((await passageEnBase(lea)).statut).toBe("terminee");
    expect((await passageEnBase(sacha)).echeanceGlobaleLe?.getTime()).toBe(apres(x.demarreLe, 680).getTime());
  });

  it("refuse le chrono par question, sans chrono, et une session qui n'est pas en cours", async () => {
    const parQuestion = await examenEnCours(horloge, {
      qcm: { modeChrono: "par_question", dureeGlobaleS: null, dureeQuestionS: 30 },
    });
    await expect(prolonger(parQuestion.session.id, 5, apres(parQuestion.demarreLe, 1))).rejects.toMatchObject(
      {
        code: "ETAT",
        message: MESSAGES_EXAMEN.prolongerGlobal,
      },
    );
    const sansChrono = await examenEnCours(horloge, { qcm: { modeChrono: "aucun", dureeGlobaleS: null } });
    await expect(prolonger(sansChrono.session.id, 5, apres(sansChrono.demarreLe, 1))).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_EXAMEN.prolongerGlobal,
    });
    const global = await examenEnCours(horloge);
    expect(await cloturerSiFinie(global.session.id, apres(global.demarreLe, 1), { forcer: true })).toBe(true);
    await expect(prolonger(global.session.id, 5, apres(global.demarreLe, 2))).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_EXAMEN.sessionPasEnCours,
    });
  });
});
