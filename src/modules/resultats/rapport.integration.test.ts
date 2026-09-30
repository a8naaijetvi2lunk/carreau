import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { journal } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { cloturerSiFinie, enregistrerEvenements, validerQuestion } from "@/modules/examen";
import { demarrerSession } from "@/modules/sessions";
import { acteurDe, creerUtilisateur, exiger } from "@/test/comptes";
import { examenEnCours, examenTermine, identifiants, passageEnBase } from "@/test/examen";
import { creerParticipationTest, creerSessionTest, INSTANT_CODE_TEST } from "@/test/sessions";
import { lireRapport } from "./rapport";

const horloge = horlogeFixe(INSTANT_CODE_TEST);

beforeEach(() => {
  horloge.fixer(INSTANT_CODE_TEST);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

/** Léa répond juste aux deux questions ; Hugo copie pendant sa première question, sans répondre. */
async function passer(x: Awaited<ReturnType<typeof examenEnCours>>): Promise<void> {
  const [lea, , hugo] = x.telephones.map((t) => t.participation.id);
  if (!lea || !hugo) throw new Error("participations absentes");
  await validerQuestion(lea, { rang: 1, selection: await identifiants(lea, 1, ["Oui"]) });
  await validerQuestion(lea, { rang: 2, selection: await identifiants(lea, 2, ["Oui"]) });
  await enregistrerEvenements(hugo, {
    chargement: "chargement-hugo",
    evenements: [
      { n: 1, type: "debut" },
      { n: 2, type: "copie" },
    ],
  });
}

async function vueDe(acteur: Parameters<typeof lireRapport>[0], participationId: string) {
  const rapport = await lireRapport(acteur, { participationId });
  if (!rapport.disponible) throw new Error("rapport indisponible");
  return rapport.vue;
}

describe("lireRapport (D9)", () => {
  it("détaille l'indice stocké, avec la durée totale des sorties", async () => {
    const x = await examenTermine(horloge, { pendant: passer });
    const hugo = exiger(x.telephones[2], "Hugo").participation.id;
    const vue = await vueDe(x.acteur, hugo);
    const stocke = await passageEnBase(hugo);
    expect(vue).toMatchObject({
      sessionId: x.session.id,
      participationId: hugo,
      nom: "Dupuis",
      prenom: "Hugo",
      classe: "TD2",
      titre: "Algorithmique — Contrôle 2",
      le: x.demarreLe.toISOString(),
      rattrapage: false,
      note: 0,
      bonnes: 0,
      questions: 2,
      dureeS: 60,
    });
    expect(vue.indice?.valeur).toBe(stocke.indice);
    expect(vue.indice?.version).toBe(1);
    // Deux silences de 30 s (avant le lot d'événements, puis jusqu'à la fin) : deux sorties, 1 min en tout.
    expect(vue.indice?.lignes).toEqual([
      {
        signal: "sortie",
        libelle: "Sortie de l’application",
        nombre: 2,
        points: 60,
        precision: "1 min au total",
      },
      {
        signal: "presse_papiers",
        libelle: "Copier, couper ou coller",
        nombre: 1,
        points: 10,
        precision: null,
      },
    ]);
    expect(vue.indice?.plafonne).toBe(false);
  });

  it("raconte le passage, questions numérotées dans l'ordre du QCM (D7)", async () => {
    const x = await examenTermine(horloge, { pendant: passer });
    const hugo = exiger(x.telephones[2], "Hugo").participation.id;
    const vue = await vueDe(x.acteur, hugo);
    const premiere = exiger((await passageEnBase(hugo)).ordre?.[0], "ordre").q + 1;
    expect(vue.chronologie[0]).toEqual({
      le: x.demarreLe.toISOString(),
      question: null,
      texte: "Début de l’examen",
      dureeS: null,
      sorte: "repere",
    });
    expect(vue.chronologie.at(-1)).toMatchObject({ texte: "Fin · 0 réponse sur 2", sorte: "repere" });
    expect(vue.chronologie).toContainEqual(
      expect.objectContaining({ texte: "Copier-coller", sorte: "notable", question: premiere }),
    );
    expect(vue.chronologie.filter((e) => e.texte === "Sortie de l’application").map((e) => e.dureeS)).toEqual(
      [30, 30],
    );
    expect(vue.chronologie).toContainEqual(
      expect.objectContaining({ texte: "Temps écoulé : dernière sélection enregistrée", question: premiere }),
    );

    const lea = exiger(x.telephones[0], "Léa").participation.id;
    const vueLea = await vueDe(x.acteur, lea);
    expect(vueLea.chronologie.filter((e) => e.texte === "Réponse validée 0 s après le retour")).toHaveLength(
      2,
    );
    expect(vueLea.chronologie.at(-1)?.texte).toBe("Fin · 2 réponses sur 2");
  });

  it("montre l'évolution de la même fiche étudiant chez le même enseignant", async () => {
    const x = await examenTermine(horloge, { pendant: passer });
    const lea = exiger(x.telephones[0], "Léa");
    const seconde = await creerSessionTest(x.enseignant.id, x.qcm.id, x.classe.id);
    await creerParticipationTest(seconde.id, lea.etudiant.id, { informationLue: true });
    horloge.fixer(new Date(x.demarreLe.getTime() + 3_600_000));
    const { demarreLe } = await demarrerSession(x.acteur, { sessionId: seconde.id });
    const fin = new Date(demarreLe.getTime() + 10_000);
    horloge.fixer(fin);
    expect(await cloturerSiFinie(seconde.id, fin, { forcer: true })).toBe(true);

    const vue = await vueDe(x.acteur, lea.participation.id);
    expect(vue.evolution.map((p) => [p.le, p.note, p.courante])).toEqual([
      [x.demarreLe.toISOString(), 20, true],
      [demarreLe.toISOString(), 0, false],
    ]);
    expect(vue.evolution[0]).toMatchObject({
      titre: "Algorithmique — Contrôle 2",
      participationId: lea.participation.id,
    });
  });

  it("attend la fin du passage, et refuse le rapport d'un autre compte", async () => {
    const enCours = await examenEnCours(horloge);
    const p = exiger(enCours.telephones[0], "Léa").participation.id;
    expect(await lireRapport(enCours.acteur, { participationId: p })).toEqual({
      disponible: false,
      sessionId: enCours.session.id,
      nom: "Dupont",
      prenom: "Léa",
    });
    const autre = acteurDe(await creerUtilisateur());
    await expect(lireRapport(autre, { participationId: p })).rejects.toMatchObject({
      code: "INTROUVABLE",
      message: "Rapport introuvable.",
    });
    const refus = await db()
      .select({ details: journal.details })
      .from(journal)
      .where(and(eq(journal.action, "acces.refus"), eq(journal.acteurId, autre.id)));
    expect(refus).toEqual([
      { details: { action: "resultats.rapport", role: "enseignant", motif: "ressource_autrui" } },
    ]);
  });
});
