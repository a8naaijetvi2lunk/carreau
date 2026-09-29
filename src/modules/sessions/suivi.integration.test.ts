import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { demandeAppareil, journal, sessionExamen } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { validerQuestion } from "@/modules/examen";
import { acteurDe, creerUtilisateur } from "@/test/comptes";
import { examenEnCours, identifiants } from "@/test/examen";
import {
  creerDemandeTest,
  creerParticipationTest,
  INSTANT_CODE_TEST,
  preparerSession,
  SECRET_CODE_TEST,
} from "@/test/sessions";
import { projeterSession, suivreSession } from "./suivi";

const horloge = horlogeFixe(INSTANT_CODE_TEST);

beforeEach(() => {
  horloge.fixer(INSTANT_CODE_TEST);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

/** Session de Léa Dupont (information lue), Sacha Dupré (absente) et Hugo Dupuis. */
async function salle() {
  const prep = await preparerSession({ codeSecret: SECRET_CODE_TEST });
  const [lea, sacha, hugo] = prep.etudiants;
  if (!lea || !sacha || !hugo) throw new Error("étudiants absents");
  const pLea = await creerParticipationTest(prep.session.id, lea.id, { informationLue: true });
  await creerParticipationTest(prep.session.id, hugo.id);
  return { ...prep, pLea };
}

describe("suivreSession", () => {
  it("rassemble participants, absents et demandes en attente, triés par nom, avec le code", async () => {
    const { acteur, session, pLea } = await salle();
    await creerDemandeTest(pLea.participation.id);
    const vue = await suivreSession(acteur, { sessionId: session.id });
    expect(vue.serveurMaintenant).toBe(new Date(INSTANT_CODE_TEST).toISOString());
    expect(vue.statut).toBe("attente");
    expect(vue.effectif).toBe(3);
    expect(vue.participants.map((p) => [p.nom, p.informationLue])).toEqual([
      ["Dupont", true],
      ["Dupuis", false],
    ]);
    expect(vue.participants.map((p) => p.avancement)).toEqual([null, null]);
    expect(vue.absents.map((a) => a.prenom)).toEqual(["Sacha"]);
    expect(vue.demandes).toMatchObject([{ nom: "Dupont", prenom: "Léa", motif: "second_appareil" }]);
    expect(vue.code).toMatchObject({ code: "3PD 4Y2", secondesRestantes: 10 });
    expect(vue.code?.lien.endsWith("/rejoindre#3PD4Y2")).toBe(true);
  });

  it("fait expirer une demande restée 10 minutes sans réponse", async () => {
    const { acteur, session, pLea } = await salle();
    const ancienne = await creerDemandeTest(pLea.participation.id, {
      creeLe: new Date(INSTANT_CODE_TEST - 600_000),
    });
    const vue = await suivreSession(acteur, { sessionId: session.id });
    expect(vue.demandes).toEqual([]);
    const [lue] = await db()
      .select()
      .from(demandeAppareil)
      .where(eq(demandeAppareil.id, ancienne.demande.id));
    expect(lue?.statut).toBe("expiree");
  });

  it("ne donne plus de code après l'annulation", async () => {
    const { acteur, session } = await salle();
    await db().update(sessionExamen).set({ statut: "annulee" }).where(eq(sessionExamen.id, session.id));
    expect((await suivreSession(acteur, { sessionId: session.id })).code).toBeNull();
  });
});

describe("projeterSession", () => {
  it("donne les noms courts, et le code en salle d'attente seulement (amendement A1)", async () => {
    const { acteur, session } = await salle();
    const attente = await projeterSession(acteur, { sessionId: session.id });
    expect(attente.connectes).toEqual(["Léa D.", "Hugo D."]);
    expect(attente.absents).toEqual(["Sacha D."]);
    expect(attente.code?.code).toBe("3PD 4Y2");
    const demarreLe = new Date(INSTANT_CODE_TEST + 5000);
    await db()
      .update(sessionExamen)
      .set({ statut: "en_cours", demarreLe })
      .where(eq(sessionExamen.id, session.id));
    const enCours = await projeterSession(acteur, { sessionId: session.id });
    expect(enCours.code).toBeNull();
    expect(enCours.demarreLe).toBe(demarreLe.toISOString());
    expect((await suivreSession(acteur, { sessionId: session.id })).code).not.toBeNull();
  });
});

describe("matrice des refus", () => {
  it("la session d'un autre compte est introuvable pour le suivi et la projection, refus journalisés", async () => {
    const { session } = await salle();
    const intrus = acteurDe(await creerUtilisateur());
    await expect(suivreSession(intrus, { sessionId: session.id })).rejects.toMatchObject({
      code: "INTROUVABLE",
    });
    await expect(projeterSession(intrus, { sessionId: session.id })).rejects.toMatchObject({
      code: "INTROUVABLE",
    });
    const refus = await db().select().from(journal).where(eq(journal.acteurId, intrus.id));
    expect(refus.map((r) => (r.details as { action?: string }).action)).toEqual([
      "sessions.suivre",
      "sessions.projeter",
    ]);
  });
});

describe("suivi pendant l'examen", () => {
  it("donne l'avancement de chacun", async () => {
    const x = await examenEnCours(horloge);
    const [lea] = x.telephones;
    if (!lea) throw new Error("téléphone absent");
    await validerQuestion(lea.participation.id, {
      rang: 1,
      selection: await identifiants(lea.participation.id, 1, ["Oui"]),
    });
    const vue = await suivreSession(x.acteur, { sessionId: x.session.id });
    expect(vue.statut).toBe("en_cours");
    expect(vue.participants.map((p) => p.avancement)).toEqual([
      { repondues: 1, total: 2, terminee: false },
      { repondues: 0, total: 2, terminee: false },
      { repondues: 0, total: 2, terminee: false },
    ]);
  });

  it("rattrape les échéances et clôt la session à l'interrogation suivante", async () => {
    const x = await examenEnCours(horloge, {
      qcm: { modeChrono: "par_question", dureeGlobaleS: null, dureeQuestionS: 30 },
    });
    horloge.fixer(x.demarreLe.getTime() + 600_000);
    const vue = await suivreSession(x.acteur, { sessionId: x.session.id });
    expect(vue.statut).toBe("terminee");
    expect(vue.participants.every((p) => p.avancement?.terminee)).toBe(true);
    expect((await projeterSession(x.acteur, { sessionId: x.session.id })).statut).toBe("terminee");
  });
});
