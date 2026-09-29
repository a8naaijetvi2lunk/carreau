import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { etudiant, qcm as tableQcm, sessionExamen } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { examenEnCours, passageEnBase } from "@/test/examen";
import { INSTANT_CODE_TEST } from "@/test/sessions";

const horloge = horlogeFixe(INSTANT_CODE_TEST);

beforeEach(() => {
  horloge.fixer(INSTANT_CODE_TEST);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

async function sessionEnBase(id: string) {
  const [s] = await db().select().from(sessionExamen).where(eq(sessionExamen.id, id));
  return s;
}

describe("preparerDepart (par demarrerSession)", () => {
  it("fige l'instantané et la fin prévue, tiers-temps compris", async () => {
    const x = await examenEnCours(horloge, {
      etudiants: [
        { nom: "Dupont", prenom: "Léa" },
        { nom: "Dupré", prenom: "Sacha", tiersTemps: true },
      ],
    });
    const s = await sessionEnBase(x.session.id);
    expect(s?.contenu?.questions).toHaveLength(2);
    expect(s?.contenu?.questions.map((q) => q.cle)).toHaveLength(2);
    // 1 200 s × 4/3 : un participant en tiers-temps allonge la fin prévue de la session.
    expect(s?.finPrevueLe?.getTime()).toBe(x.demarreLe.getTime() + 1_600_000);
  });

  it("donne à chacun son ordre, sa première question et ses échéances, tiers-temps figé", async () => {
    const x = await examenEnCours(horloge, {
      etudiants: [
        { nom: "Dupont", prenom: "Léa" },
        { nom: "Dupré", prenom: "Sacha", tiersTemps: true },
      ],
    });
    const [lea, sacha] = x.telephones;
    const pLea = await passageEnBase(lea?.participation.id ?? "");
    expect(pLea).toMatchObject({
      statut: "en_cours",
      tiersTemps: false,
      indexCourant: 0,
      echeanceQuestionLe: null,
      termineeLe: null,
    });
    expect(pLea.questionServieLe?.getTime()).toBe(x.demarreLe.getTime());
    expect(pLea.echeanceGlobaleLe?.getTime()).toBe(x.demarreLe.getTime() + 1_200_000);
    expect([...(pLea.ordre ?? []).map((o) => o.q)].sort()).toEqual([0, 1]);
    for (const o of pLea.ordre ?? []) expect([...o.p].sort()).toEqual([0, 1]);
    const pSacha = await passageEnBase(sacha?.participation.id ?? "");
    expect(pSacha.tiersTemps).toBe(true);
    expect(pSacha.echeanceGlobaleLe?.getTime()).toBe(x.demarreLe.getTime() + 1_600_000);
    // Figé : modifier la fiche pendant l'examen ne change plus rien.
    await db()
      .update(etudiant)
      .set({ tiersTemps: false })
      .where(eq(etudiant.id, sacha?.etudiant.id ?? ""));
    expect((await passageEnBase(sacha?.participation.id ?? "")).tiersTemps).toBe(true);
  });

  it("pose l'échéance de la première question en chrono par question", async () => {
    const x = await examenEnCours(horloge, {
      qcm: { modeChrono: "par_question", dureeGlobaleS: null, dureeQuestionS: 30 },
      questions: [{}, { dureeS: 90 }],
    });
    const p = await passageEnBase(x.telephones[0]?.participation.id ?? "");
    const premiere = p.ordre?.[0]?.q === 0 ? 30 : 90;
    expect(p.echeanceQuestionLe?.getTime()).toBe(x.demarreLe.getTime() + premiere * 1000);
    expect(p.echeanceGlobaleLe).toBeNull();
    const s = await sessionEnBase(x.session.id);
    expect(s?.finPrevueLe?.getTime()).toBe(x.demarreLe.getTime() + 120_000);
  });

  it("n'a ni échéance ni fin prévue sans chrono", async () => {
    const x = await examenEnCours(horloge, { qcm: { modeChrono: "aucun", dureeGlobaleS: null } });
    const p = await passageEnBase(x.telephones[0]?.participation.id ?? "");
    expect(p).toMatchObject({ echeanceQuestionLe: null, echeanceGlobaleLe: null });
    expect((await sessionEnBase(x.session.id))?.finPrevueLe).toBeNull();
  });

  it("garde l'instantané quand le QCM change après le départ", async () => {
    const x = await examenEnCours(horloge);
    const avant = (await sessionEnBase(x.session.id))?.contenu;
    await db()
      .update(tableQcm)
      .set({ titre: "Autre titre", statut: "brouillon" })
      .where(eq(tableQcm.id, x.qcm.id));
    expect((await sessionEnBase(x.session.id))?.contenu).toEqual(avant);
  });
});
