import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { journal, participation, sessionExamen } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { examenEnCours, passageEnBase, poserBrouillon, questionDuRang, reponsesEnBase } from "@/test/examen";
import { INSTANT_CODE_TEST } from "@/test/sessions";
import { cloturerSiFinie, passageAJour, rattraperSession } from "./passage";

const horloge = horlogeFixe(INSTANT_CODE_TEST);

beforeEach(() => {
  horloge.fixer(INSTANT_CODE_TEST);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

/** Chrono par question de 30 s, deux questions « Oui » (juste) / « Non » (faux), −0,25 par erreur. */
const PAR_QUESTION = {
  qcm: { modeChrono: "par_question" as const, dureeGlobaleS: null, dureeQuestionS: 30 },
  questions: [{ pointsMauvaise: -0.25 }, { pointsMauvaise: -0.25 }],
};

function apres(depart: Date, secondes: number): Date {
  return new Date(depart.getTime() + secondes * 1000);
}

async function statutSession(id: string) {
  const [s] = await db().select().from(sessionExamen).where(eq(sessionExamen.id, id));
  return s;
}

describe("rattrapage d'un passage", () => {
  it("ne touche à rien avant l'expiration d'une échéance", async () => {
    const x = await examenEnCours(horloge, PAR_QUESTION);
    const p = x.telephones[0]?.participation.id ?? "";
    horloge.fixer(apres(x.demarreLe, 33));
    await passageAJour(p);
    expect((await passageEnBase(p)).indexCourant).toBe(0);
    expect(await reponsesEnBase(p)).toEqual([]);
  });

  it("valide la question échue avec sa dernière sélection et sert la suivante à l'expiration", async () => {
    const x = await examenEnCours(horloge, PAR_QUESTION);
    const p = x.telephones[0]?.participation.id ?? "";
    await poserBrouillon(p, 1, ["Oui"]);
    horloge.fixer(apres(x.demarreLe, 34));
    const passage = await passageAJour(p);
    expect(passage?.etat.indexCourant).toBe(1);
    const enBase = await passageEnBase(p);
    expect(enBase.questionServieLe?.getTime()).toBe(apres(x.demarreLe, 33).getTime());
    expect(enBase.echeanceQuestionLe?.getTime()).toBe(apres(x.demarreLe, 63).getTime());
    const cle = (await questionDuRang(p, 1)).cle;
    const [r] = (await reponsesEnBase(p)).filter((l) => l.questionCle === cle);
    expect(r).toMatchObject({ selection: [0], origine: "echeance", points: 1 });
    expect(r?.valideeLe?.getTime()).toBe(apres(x.demarreLe, 33).getTime());
  });

  it("termine le passage d'un téléphone éteint, échéances enchaînées, et le note", async () => {
    const x = await examenEnCours(horloge, PAR_QUESTION);
    const p = x.telephones[0]?.participation.id ?? "";
    horloge.fixer(apres(x.demarreLe, 600));
    await passageAJour(p);
    const enBase = await passageEnBase(p);
    expect(enBase).toMatchObject({ statut: "terminee", indexCourant: 2, points: 0, noteSur20: 0 });
    expect(enBase.termineeLe?.getTime()).toBe(apres(x.demarreLe, 66).getTime());
    const reponses = await reponsesEnBase(p);
    expect(reponses.map((r) => r.origine)).toEqual(["echeance", "echeance"]);
    expect(reponses.map((r) => r.selection)).toEqual([[], []]);
  });

  it("borne le total à 0", async () => {
    const x = await examenEnCours(horloge, PAR_QUESTION);
    const p = x.telephones[0]?.participation.id ?? "";
    await poserBrouillon(p, 1, ["Non"]);
    await poserBrouillon(p, 2, ["Non"]);
    horloge.fixer(apres(x.demarreLe, 600));
    await passageAJour(p);
    expect(await passageEnBase(p)).toMatchObject({ statut: "terminee", points: 0, noteSur20: 0 });
    expect((await reponsesEnBase(p)).map((r) => r.points)).toEqual([-0.25, -0.25]);
  });

  it("à l'échéance globale : question courante validée, suivantes sans réponse", async () => {
    const x = await examenEnCours(horloge, { qcm: { modeChrono: "global", dureeGlobaleS: 60 } });
    const p = x.telephones[0]?.participation.id ?? "";
    await poserBrouillon(p, 1, ["Oui"]);
    horloge.fixer(apres(x.demarreLe, 64));
    await passageAJour(p);
    const enBase = await passageEnBase(p);
    expect(enBase).toMatchObject({ statut: "terminee", points: 1, noteSur20: 10 });
    expect(enBase.termineeLe?.getTime()).toBe(apres(x.demarreLe, 63).getTime());
    const premiere = (await questionDuRang(p, 1)).cle;
    const parCle = new Map((await reponsesEnBase(p)).map((r) => [r.questionCle, r]));
    expect(parCle.get(premiere)).toMatchObject({ origine: "echeance", selection: [0] });
    const seconde = (await questionDuRang(p, 2)).cle;
    expect(parCle.get(seconde)).toMatchObject({ origine: "fin", selection: [], points: 0 });
  });

  it("ne réécrit rien au second passage", async () => {
    const x = await examenEnCours(horloge, PAR_QUESTION);
    const p = x.telephones[0]?.participation.id ?? "";
    horloge.fixer(apres(x.demarreLe, 600));
    await passageAJour(p);
    const avant = await reponsesEnBase(p);
    await passageAJour(p);
    expect(await reponsesEnBase(p)).toEqual(avant);
  });

  it("n'accepte qu'une participation existante", async () => {
    expect(await passageAJour("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("rattrapage d'une session et clôture", () => {
  it("laisse la session en cours tant qu'un passage est ouvert", async () => {
    const x = await examenEnCours(horloge, PAR_QUESTION);
    horloge.fixer(apres(x.demarreLe, 10));
    await rattraperSession(x.session.id);
    expect((await statutSession(x.session.id))?.statut).toBe("en_cours");
    expect(await cloturerSiFinie(x.session.id)).toBe(false);
  });

  it("clôt les passages échus puis la session, une seule fois, et le journalise", async () => {
    const x = await examenEnCours(horloge, PAR_QUESTION);
    horloge.fixer(apres(x.demarreLe, 600));
    await Promise.all([rattraperSession(x.session.id), rattraperSession(x.session.id)]);
    const s = await statutSession(x.session.id);
    expect(s?.statut).toBe("terminee");
    expect(s?.termineLe?.getTime()).toBe(apres(x.demarreLe, 600).getTime());
    for (const t of x.telephones) expect((await passageEnBase(t.participation.id)).statut).toBe("terminee");
    const entrees = await db()
      .select()
      .from(journal)
      .where(
        and(eq(journal.action, "examen.cloturer_session"), eq(journal.cible, `session:${x.session.id}`)),
      );
    expect(entrees).toHaveLength(1);
    expect(entrees[0]).toMatchObject({ acteurType: "systeme", details: { participants: 3 } });
    expect(await cloturerSiFinie(x.session.id)).toBe(false);
  });

  it("termine d'office, 10 min après la fin prévue, un passage resté ouvert", async () => {
    const x = await examenEnCours(horloge, { qcm: { modeChrono: "global", dureeGlobaleS: 60 } });
    const [lea, ...autres] = x.telephones;
    const p = lea?.participation.id ?? "";
    await poserBrouillon(p, 1, ["Oui"]);
    // Passage sans échéance (donnée incohérente) : seule la fin prévue permet de le clore.
    await db().update(participation).set({ echeanceGlobaleLe: null }).where(eq(participation.id, p));
    horloge.fixer(apres(x.demarreLe, 64));
    await rattraperSession(x.session.id);
    for (const t of autres) expect((await passageEnBase(t.participation.id)).statut).toBe("terminee");
    expect((await statutSession(x.session.id))?.statut).toBe("en_cours");
    const cloture = apres(x.demarreLe, 60 + 600 + 1);
    horloge.fixer(cloture);
    expect(await cloturerSiFinie(x.session.id)).toBe(true);
    const enBase = await passageEnBase(p);
    expect(enBase).toMatchObject({ statut: "terminee", points: 1, noteSur20: 10 });
    expect(enBase.termineeLe?.getTime()).toBe(cloture.getTime());
    expect((await statutSession(x.session.id))?.statut).toBe("terminee");
  });

  it("sans chrono, ne clôt la session que lorsque tout le monde a fini", async () => {
    const x = await examenEnCours(horloge, { qcm: { modeChrono: "aucun", dureeGlobaleS: null } });
    horloge.fixer(apres(x.demarreLe, 24 * 3600));
    await rattraperSession(x.session.id);
    expect((await statutSession(x.session.id))?.statut).toBe("en_cours");
    for (const t of x.telephones) {
      await db()
        .update(participation)
        .set({ statut: "terminee", termineeLe: horloge.maintenant() })
        .where(eq(participation.id, t.participation.id));
    }
    expect(await cloturerSiFinie(x.session.id)).toBe(true);
  });

  it("« Terminer pour tous » : chaque passage ouvert est clos à l'instant, la clôture est journalisée comme forcée", async () => {
    const x = await examenEnCours(horloge);
    const [lea, sacha, hugo] = x.telephones.map((t) => t.participation.id);
    if (!lea || !sacha || !hugo) throw new Error("participations absentes");
    await poserBrouillon(lea, 1, ["Oui"]);
    const fin = apres(x.demarreLe, 90);
    horloge.fixer(fin);
    expect(await cloturerSiFinie(x.session.id, fin)).toBe(false);
    expect(await cloturerSiFinie(x.session.id, fin, { forcer: true })).toBe(true);
    const s = await statutSession(x.session.id);
    expect(s?.statut).toBe("terminee");
    expect(s?.termineLe?.getTime()).toBe(fin.getTime());
    for (const p of [lea, sacha, hugo]) {
      const enBase = await passageEnBase(p);
      expect(enBase.statut).toBe("terminee");
      expect(enBase.termineeLe?.getTime()).toBe(fin.getTime());
      expect(enBase.indice).not.toBeNull();
    }
    // Léa : sa dernière sélection est validée à l'échéance, la question suivante reste sans réponse.
    const reponses = await reponsesEnBase(lea);
    expect(reponses.map((r) => r.origine).sort()).toEqual(["echeance", "fin"]);
    expect((await passageEnBase(lea)).noteSur20).toBe(10);
    const [entree] = await db()
      .select()
      .from(journal)
      .where(
        and(eq(journal.action, "examen.cloturer_session"), eq(journal.cible, `session:${x.session.id}`)),
      );
    expect(entree?.details).toEqual({ participants: 3, forcee: true });
    expect(await cloturerSiFinie(x.session.id, fin, { forcer: true })).toBe(false);
  });
});
