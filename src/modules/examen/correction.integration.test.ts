import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { sessionExamen } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { creerRattrapage } from "@/modules/sessions";
import { exiger } from "@/test/comptes";
import { examenEnCours, examenTermine, identifiants } from "@/test/examen";
import { INSTANT_CODE_TEST } from "@/test/sessions";
import { correctionDuPassage } from "./correction";
import { correctionPubliee } from "./publication";
import { vuePassage } from "./vue";
import { validerQuestion } from "./reponses";

const horloge = horlogeFixe(INSTANT_CODE_TEST);

beforeEach(() => {
  horloge.fixer(INSTANT_CODE_TEST);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

/** Léa : « Oui » (juste) à sa première question, « Non » (faux) à la seconde. */
async function repondre(x: Awaited<ReturnType<typeof examenEnCours>>): Promise<void> {
  const lea = exiger(x.telephones[0], "Léa").participation.id;
  await validerQuestion(lea, { rang: 1, selection: await identifiants(lea, 1, ["Oui"]) });
  await validerQuestion(lea, { rang: 2, selection: await identifiants(lea, 2, ["Non"]) });
}

async function publier(sessionId: string, correctionVisible = true): Promise<void> {
  await db().update(sessionExamen).set({ correctionVisible }).where(eq(sessionExamen.id, sessionId));
}

describe("correction (D11)", () => {
  it("n'est publiée qu'une fois la session terminée, avec correction visible", async () => {
    const enCours = await examenEnCours(horloge);
    await publier(enCours.session.id);
    expect(await correctionPubliee(db(), enCours.session.id)).toBe(false);
    const x = await examenTermine(horloge, { pendant: repondre });
    expect(await correctionPubliee(db(), x.session.id)).toBe(false);
    await publier(x.session.id);
    expect(await correctionPubliee(db(), x.session.id)).toBe(true);
  });

  it("attend la fin de tous les rattrapages de la session d'origine (A1)", async () => {
    const x = await examenTermine(horloge, { pendant: repondre });
    await publier(x.session.id);
    const [ines] = x.absents;
    const { id } = await creerRattrapage(x.acteur, {
      sessionId: x.session.id,
      etudiantIds: [ines.id],
      creneauPrevu: "",
    });
    await publier(id);
    expect(await correctionPubliee(db(), x.session.id)).toBe(false);
    const lea = exiger(x.telephones[0], "Léa").participation.id;
    expect(await correctionDuPassage(lea)).toBeNull();
    const fin = await vuePassage(lea);
    expect(fin).toMatchObject({ etape: "fin", correction: false });
    await db().update(sessionExamen).set({ statut: "annulee" }).where(eq(sessionExamen.id, id));
    expect(await correctionPubliee(db(), x.session.id)).toBe(true);
    expect(await vuePassage(lea)).toMatchObject({ etape: "fin", correction: true });
  });

  it("donne les questions dans l'ordre de l'étudiant, ses réponses, les bonnes, et les points", async () => {
    const x = await examenTermine(horloge, { pendant: repondre });
    await publier(x.session.id);
    const lea = exiger(x.telephones[0], "Léa").participation.id;
    const correction = exiger(await correctionDuPassage(lea), "correction");
    // Barème du QCM de test : +1 juste, -0,25 faux ; 0,75 point sur 2, soit 7,5 / 20.
    expect(correction.note).toBe(7.5);
    expect(correction.questions.map((q) => [q.rang, q.resultat, q.points, q.pointsBonne])).toEqual([
      [1, "juste", 1, 1],
      [2, "faux", -0.25, 1],
    ]);
    const [premiere, seconde] = correction.questions;
    expect(premiere?.propositions.find((p) => p.texte === "Oui")).toMatchObject({
      correcte: true,
      choisie: true,
    });
    expect(premiere?.propositions.find((p) => p.texte === "Non")).toMatchObject({
      correcte: false,
      choisie: false,
    });
    expect(seconde?.propositions.find((p) => p.texte === "Non")).toMatchObject({
      correcte: false,
      choisie: true,
    });
    // L'ordre des réponses est celui que l'étudiant a vu.
    const [positionOui, positionNon] = await identifiants(lea, 1, ["Oui", "Non"]);
    expect(premiere?.propositions.map((p) => p.texte)).toEqual(
      Number(positionOui) < Number(positionNon) ? ["Oui", "Non"] : ["Non", "Oui"],
    );

    await db().update(sessionExamen).set({ noteVisible: false }).where(eq(sessionExamen.id, x.session.id));
    expect((await correctionDuPassage(lea))?.note).toBeNull();
    // Sacha n'a rien répondu : tout est « sans réponse ».
    const sacha = exiger(x.telephones[1], "Sacha").participation.id;
    expect((await correctionDuPassage(sacha))?.questions.map((q) => q.resultat)).toEqual(["vide", "vide"]);
  });
});
