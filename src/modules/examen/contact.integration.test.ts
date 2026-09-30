import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { evenement, participation } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { examenEnCours, identifiants, passageEnBase } from "@/test/examen";
import { INSTANT_CODE_TEST } from "@/test/sessions";
import { noterContact, passageAJour, verrouillerPassage } from "./passage";
import { enregistrerBrouillon, validerQuestion } from "./reponses";
import { vuePassage } from "./vue";

const horloge = horlogeFixe(INSTANT_CODE_TEST);

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

describe("contacts et silences (décision D3)", () => {
  it("note un silence quand le téléphone se tait plus de 15 s, mesuré depuis le départ", async () => {
    const x = await examenEnCours(horloge);
    const p = x.telephones[0]?.participation.id ?? "";
    horloge.fixer(apres(x.demarreLe, 20));
    await vuePassage(p);
    const [silence] = await evenementsDe(p);
    expect(silence).toMatchObject({ type: "silence", dureeMs: 20_000, questionIndex: 0, chargement: null });
    expect(silence?.recuLe.getTime()).toBe(apres(x.demarreLe, 20).getTime());
    expect((await passageEnBase(p)).dernierContactLe.getTime()).toBe(apres(x.demarreLe, 20).getTime());
  });

  it("ne note rien sous 15 s, ni avant le départ", async () => {
    const x = await examenEnCours(horloge);
    const p = x.telephones[0]?.participation.id ?? "";
    horloge.fixer(x.demarreLe.getTime() - 1);
    await vuePassage(p);
    for (const s of [10, 24, 38]) {
      horloge.fixer(apres(x.demarreLe, s));
      await vuePassage(p);
    }
    expect(await evenementsDe(p)).toEqual([]);
  });

  it("compte la sélection et la validation comme des contacts", async () => {
    const x = await examenEnCours(horloge);
    const p = x.telephones[0]?.participation.id ?? "";
    horloge.fixer(apres(x.demarreLe, 20));
    await enregistrerBrouillon(p, { rang: 1, selection: [] });
    horloge.fixer(apres(x.demarreLe, 40));
    await validerQuestion(p, { rang: 1, selection: await identifiants(p, 1, ["Oui"]) });
    expect((await evenementsDe(p)).map((ev) => ev.dureeMs)).toEqual([20_000, 20_000]);
  });

  it("téléphone éteint jusqu'à la fin : silence jusqu'à la fin, indice final écrit", async () => {
    const x = await examenEnCours(horloge, {
      qcm: { modeChrono: "par_question", dureeGlobaleS: null, dureeQuestionS: 30 },
    });
    const p = x.telephones[0]?.participation.id ?? "";
    horloge.fixer(apres(x.demarreLe, 600));
    await passageAJour(p);
    const fin = apres(x.demarreLe, 66);
    const [silence] = await evenementsDe(p);
    expect(silence).toMatchObject({ type: "silence", dureeMs: 66_000 });
    expect(silence?.recuLe.getTime()).toBe(fin.getTime());
    expect(await passageEnBase(p)).toMatchObject({
      statut: "terminee",
      indice: 45,
      indiceVersion: 1,
      indiceDetail: [{ signal: "sortie", nombre: 1, points: 45 }],
    });
    // Le téléphone revient après la fin : aucun nouveau silence.
    horloge.fixer(apres(x.demarreLe, 700));
    await vuePassage(p);
    expect(await evenementsDe(p)).toHaveLength(1);
  });

  it("ne fait jamais reculer le dernier contact (requête plus ancienne traitée après une plus récente)", async () => {
    const x = await examenEnCours(horloge);
    const p = x.telephones[0]?.participation.id ?? "";
    const plusRecent = apres(x.demarreLe, 20);
    await db().update(participation).set({ dernierContactLe: plusRecent }).where(eq(participation.id, p));
    await db().transaction(async (tx) => {
      const passage = await verrouillerPassage(tx, p);
      if (!passage) throw new Error("passage introuvable");
      await noterContact(tx, passage, apres(x.demarreLe, 10));
    });
    expect(await evenementsDe(p)).toEqual([]);
    expect((await passageEnBase(p)).dernierContactLe.getTime()).toBe(plusRecent.getTime());
  });

  it("passage mené jusqu'au bout sans écart : indice 0, détail vide", async () => {
    const x = await examenEnCours(horloge);
    const p = x.telephones[0]?.participation.id ?? "";
    horloge.fixer(apres(x.demarreLe, 5));
    await validerQuestion(p, { rang: 1, selection: [] });
    await validerQuestion(p, { rang: 2, selection: [] });
    expect(await passageEnBase(p)).toMatchObject({
      statut: "terminee",
      indice: 0,
      indiceVersion: 1,
      indiceDetail: [],
    });
    expect(await evenementsDe(p)).toEqual([]);
  });
});
