import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { journal, sessionExamen } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { cloturerSiFinie, validerQuestion } from "@/modules/examen";
import { creerRattrapage, demarrerSession } from "@/modules/sessions";
import { acteurDe, creerUtilisateur, exiger } from "@/test/comptes";
import { examenEnCours, examenTermine, identifiants, passageEnBase } from "@/test/examen";
import { creerParticipationTest, INSTANT_CODE_TEST } from "@/test/sessions";
import { listerResultats, lireResultats, reglerVisibilite } from "./resultats";

const horloge = horlogeFixe(INSTANT_CODE_TEST);

beforeEach(() => {
  horloge.fixer(INSTANT_CODE_TEST);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

/** Léa : deux bonnes réponses ; Sacha : une mauvaise ; Hugo : une bonne, la seconde sans réponse. */
async function repondre(x: Awaited<ReturnType<typeof examenEnCours>>): Promise<void> {
  const [lea, sacha, hugo] = x.telephones.map((t) => t.participation.id);
  if (!lea || !sacha || !hugo) throw new Error("participations absentes");
  await validerQuestion(lea, { rang: 1, selection: await identifiants(lea, 1, ["Oui"]) });
  await validerQuestion(lea, { rang: 2, selection: await identifiants(lea, 2, ["Oui"]) });
  await validerQuestion(sacha, { rang: 1, selection: await identifiants(sacha, 1, ["Non"]) });
  await validerQuestion(hugo, { rang: 1, selection: await identifiants(hugo, 1, ["Oui"]) });
}

async function vueDe(acteur: Parameters<typeof lireResultats>[0], sessionId: string) {
  const resultats = await lireResultats(acteur, { sessionId });
  if (!resultats.disponible) throw new Error("résultats indisponibles");
  return resultats.vue;
}

/** Rattrapage d'Inès créé, démarré, et son départ atteint. */
async function rattrapageDInes(x: Awaited<ReturnType<typeof examenTermine>>) {
  const [ines] = x.absents;
  const { id } = await creerRattrapage(x.acteur, {
    sessionId: x.session.id,
    etudiantIds: [ines.id],
    creneauPrevu: "",
  });
  const { participation } = await creerParticipationTest(id, ines.id, { informationLue: true });
  const { demarreLe } = await demarrerSession(x.acteur, { sessionId: id });
  horloge.fixer(demarreLe);
  return { id, participationId: participation.id, demarreLe };
}

describe("lireResultats (D5)", () => {
  it("attend la fin de l'examen", async () => {
    const x = await examenEnCours(horloge);
    expect(await lireResultats(x.acteur, { sessionId: x.session.id })).toEqual({
      disponible: false,
      sessionId: x.session.id,
      titre: "Algorithmique — Contrôle 2",
      classe: "TD2",
      statut: "en_cours",
    });
  });

  it("donne une ligne par étudiant : notes, bonnes réponses, durées, indices, absents et statistiques", async () => {
    const x = await examenTermine(horloge, { pendant: repondre });
    const vue = await vueDe(x.acteur, x.session.id);
    expect(vue).toMatchObject({
      sessionId: x.session.id,
      titre: "Algorithmique — Contrôle 2",
      classe: "TD2",
      demarreLe: x.demarreLe.toISOString(),
      duree: "20 min",
      questions: 2,
      noteVisible: true,
      correctionVisible: false,
      rattrapageOuvert: false,
    });
    expect(vue.lignes.map((l) => [l.nom, l.statut, l.passage, l.note, l.points, l.bonnes, l.dureeS])).toEqual(
      [
        ["Dupont", "present", "session", 20, 2, 2, 30],
        ["Dupuis", "present", "session", 10, 1, 1, 60],
        ["Dupré", "present", "session", 0, 0, 0, 60],
        ["Bernard", "absent", null, null, null, null, null],
        ["Martin", "absent", null, null, null, null, null],
      ],
    );
    const indices: number[] = [];
    for (const l of vue.lignes.filter((x) => x.statut === "present")) {
      const stocke = (await passageEnBase(exiger(l.participationId, "participation"))).indice;
      expect(l.indice).toBe(stocke);
      indices.push(stocke ?? 0);
    }
    expect(vue.statistiques).toEqual({
      moyenne: 10,
      mediane: 10,
      presents: 3,
      effectif: 5,
      indicesEleves: indices.filter((i) => i >= 60).length,
    });
  });

  it("rassemble les rattrapages : prévu, puis rattrapé à la lecture, marqué « rattrapage »", async () => {
    const x = await examenTermine(horloge);
    const [ines, tom] = x.absents;
    const { id } = await creerRattrapage(x.acteur, {
      sessionId: x.session.id,
      etudiantIds: [ines.id],
      creneauPrevu: "",
    });
    let vue = await vueDe(x.acteur, x.session.id);
    expect(vue.rattrapageOuvert).toBe(true);
    expect(vue.lignes.find((l) => l.etudiantId === ines.id)).toMatchObject({
      statut: "absent",
      rattrapagePrevu: { sessionId: id, statut: "attente", creneauPrevuLe: null },
    });
    expect(vue.lignes.find((l) => l.etudiantId === tom.id)?.rattrapagePrevu).toBeNull();

    const { participation } = await creerParticipationTest(id, ines.id, { informationLue: true });
    const { demarreLe } = await demarrerSession(x.acteur, { sessionId: id });
    horloge.fixer(new Date(demarreLe.getTime() + 1_000));
    vue = await vueDe(x.acteur, x.session.id);
    expect(vue.lignes.find((l) => l.etudiantId === ines.id)).toMatchObject({
      statut: "en_cours",
      participationId: participation.id,
      passage: "rattrapage",
      note: null,
    });

    // Échéance globale (20 min) dépassée, tolérance comprise : la lecture des résultats rattrape le passage.
    horloge.fixer(new Date(demarreLe.getTime() + 20 * 60_000 + 4_000));
    vue = await vueDe(x.acteur, id);
    expect(vue.sessionId).toBe(x.session.id);
    expect(vue.rattrapageOuvert).toBe(false);
    expect(vue.lignes.find((l) => l.etudiantId === ines.id)).toMatchObject({
      statut: "present",
      passage: "rattrapage",
      rattrapageLe: demarreLe.toISOString(),
      note: 0,
      // Close à l'expiration de l'échéance globale : 20 min plus la tolérance de 3 s (A3 du lot 5).
      dureeS: 1203,
    });
    expect(vue.statistiques.presents).toBe(4);
  });

  it("refuse la session d'un autre compte comme une session inconnue, et journalise le refus", async () => {
    const x = await examenTermine(horloge);
    const autre = acteurDe(await creerUtilisateur());
    await expect(lireResultats(autre, { sessionId: x.session.id })).rejects.toMatchObject({
      code: "INTROUVABLE",
      message: "Session introuvable.",
    });
    const refus = await db()
      .select({ details: journal.details })
      .from(journal)
      .where(and(eq(journal.action, "acces.refus"), eq(journal.acteurId, autre.id)));
    expect(refus).toEqual([
      { details: { action: "resultats.lire", role: "enseignant", motif: "ressource_autrui" } },
    ]);
    await expect(lireResultats(x.acteur, { sessionId: "pas-un-uuid" })).rejects.toMatchObject({
      code: "INTROUVABLE",
    });
  });
});

describe("reglerVisibilite (D6)", () => {
  it("règle la session d'origine et ses rattrapages, et le journalise", async () => {
    const x = await examenTermine(horloge);
    const r = await rattrapageDInes(x);
    await reglerVisibilite(x.acteur, {
      sessionId: x.session.id,
      noteVisible: false,
      correctionVisible: true,
    });
    const lues = await db()
      .select({
        id: sessionExamen.id,
        noteVisible: sessionExamen.noteVisible,
        correctionVisible: sessionExamen.correctionVisible,
      })
      .from(sessionExamen)
      .where(eq(sessionExamen.enseignantId, x.acteur.id));
    expect(lues.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [
        { id: x.session.id, noteVisible: false, correctionVisible: true },
        { id: r.id, noteVisible: false, correctionVisible: true },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );
    const [trace] = await db().select().from(journal).where(eq(journal.action, "resultats.visibilite"));
    expect(trace).toMatchObject({
      cible: `session:${x.session.id}`,
      details: { noteVisible: false, correctionVisible: true },
    });
    await expect(
      reglerVisibilite(x.acteur, {
        sessionId: x.session.id,
        noteVisible: "oui" as unknown as boolean,
        correctionVisible: true,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("listerResultats", () => {
  it("liste les examens terminés de l'acteur, rattrapages compris dans les présents", async () => {
    const x = await examenTermine(horloge, { pendant: repondre });
    const r = await rattrapageDInes(x);
    const fin = new Date(r.demarreLe.getTime() + 10_000);
    horloge.fixer(fin);
    expect(await cloturerSiFinie(r.id, fin, { forcer: true })).toBe(true);
    const enCours = await examenEnCours(horloge);
    const liste = await listerResultats(x.acteur);
    expect(liste).toEqual([
      {
        sessionId: x.session.id,
        titre: "Algorithmique — Contrôle 2",
        classe: "TD2",
        demarreLe: x.demarreLe.toISOString(),
        termineLe: expect.any(String),
        presents: 4,
        effectif: 5,
        moyenne: 7.5,
      },
    ]);
    expect(await listerResultats(enCours.acteur)).toEqual([]);
  });
});
