import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  demandeAppareil,
  evenement,
  journal,
  parametres,
  participation,
  qcm as tableQcm,
  sessionExamen,
} from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { sha256Hex } from "@/lib/jetons";
import { MESSAGES_EXAMEN } from "@/lib/regles-examen";
import { cloturerSiFinie } from "@/modules/examen";
import { acteurDe, creerUtilisateur, exiger } from "@/test/comptes";
import { examenEnCours } from "@/test/examen";
import {
  creerDemandeTest,
  creerParticipationTest,
  INSTANT_CODE_TEST,
  preparerSession,
  renseignerRgpd,
  SECRET_CODE_TEST,
} from "@/test/sessions";
import { MESSAGES_SESSION } from "./commun";
import { lireEtatEntree, reclamerNom } from "./entree";
import {
  autoriserDemande,
  demarrerSession,
  prolongerSession,
  refuserDemande,
  retirerParticipant,
  terminerSession,
} from "./pilotage";
import { emettreTicket } from "./ticket";

const horloge = horlogeFixe(INSTANT_CODE_TEST);

beforeEach(() => {
  horloge.fixer(INSTANT_CODE_TEST);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

async function salle() {
  await renseignerRgpd();
  const prep = await preparerSession({ codeSecret: SECRET_CODE_TEST });
  const [lea, sacha, hugo] = prep.etudiants;
  if (!lea || !sacha || !hugo) throw new Error("étudiants absents");
  return { ...prep, lea, sacha, hugo };
}

async function entree(action: string, cible: string) {
  const [ligne] = await db()
    .select()
    .from(journal)
    .where(and(eq(journal.action, action), eq(journal.cible, cible)));
  return ligne;
}

async function refusDe(acteurId: string) {
  return db()
    .select()
    .from(journal)
    .where(and(eq(journal.action, "acces.refus"), eq(journal.acteurId, acteurId)));
}

/** Léa réclamée par un premier téléphone, puis par un second : une demande en attente. */
async function demandeEnAttente() {
  const s = await salle();
  const premier = await reclamerNom(
    { ticket: emettreTicket(s.session.id), jetonAppareil: null },
    { etudiantId: s.lea.id },
  );
  const second = await reclamerNom(
    { ticket: emettreTicket(s.session.id), jetonAppareil: null },
    { etudiantId: s.lea.id },
  );
  const p = exiger(
    (await db().select().from(participation).where(eq(participation.sessionId, s.session.id)))[0],
    "participation",
  );
  const d = exiger(
    (await db().select().from(demandeAppareil).where(eq(demandeAppareil.participationId, p.id)))[0],
    "demande",
  );
  return {
    ...s,
    p,
    d,
    jetonPremier: exiger(premier.jetonAppareil, "jeton"),
    jetonSecond: exiger(second.jetonAppareil, "jeton"),
  };
}

describe("demarrerSession", () => {
  it("fixe le départ à 5 s, passe les participations en cours et journalise", async () => {
    const { acteur, session, lea, hugo } = await salle();
    await creerParticipationTest(session.id, lea.id, { informationLue: true });
    await creerParticipationTest(session.id, hugo.id);
    const { demarreLe } = await demarrerSession(acteur, { sessionId: session.id });
    expect(demarreLe.getTime()).toBe(INSTANT_CODE_TEST + 5_000);
    const [demarree] = await db().select().from(sessionExamen).where(eq(sessionExamen.id, session.id));
    expect(demarree?.statut).toBe("en_cours");
    expect(demarree?.demarreLe?.getTime()).toBe(INSTANT_CODE_TEST + 5_000);
    const participations = await db()
      .select()
      .from(participation)
      .where(eq(participation.sessionId, session.id));
    expect(participations.map((p) => p.statut)).toEqual(["en_cours", "en_cours"]);
    expect(await entree("sessions.demarrer", `session:${session.id}`)).toMatchObject({
      details: { participants: 2, questions: 2 },
    });
  });

  it("refuse sans participant, puis une session déjà démarrée", async () => {
    const { acteur, session, lea } = await salle();
    await expect(demarrerSession(acteur, { sessionId: session.id })).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_SESSION.aucunParticipant,
    });
    await creerParticipationTest(session.id, lea.id);
    await demarrerSession(acteur, { sessionId: session.id });
    await expect(demarrerSession(acteur, { sessionId: session.id })).rejects.toMatchObject({
      message: MESSAGES_SESSION.dejaDemarree,
    });
  });

  it("refuse si le QCM n'est plus prêt, ou sans paramètres de conservation", async () => {
    const { acteur, session, lea, qcm } = await salle();
    await creerParticipationTest(session.id, lea.id);
    await db().update(tableQcm).set({ statut: "brouillon" }).where(eq(tableQcm.id, qcm.id));
    await expect(demarrerSession(acteur, { sessionId: session.id })).rejects.toMatchObject({
      message: MESSAGES_SESSION.qcmPlusPret,
    });
    await db().update(tableQcm).set({ statut: "pret" }).where(eq(tableQcm.id, qcm.id));
    await db().delete(parametres);
    await expect(demarrerSession(acteur, { sessionId: session.id })).rejects.toMatchObject({
      message: MESSAGES_SESSION.rgpd,
    });
  });

  it("« Démarrer » pendant une réclamation : la réclamation passe avant, ou reçoit « La session a démarré »", async () => {
    const { acteur, session, lea, hugo } = await salle();
    await creerParticipationTest(session.id, lea.id);
    const [demarrage, reclamation] = await Promise.allSettled([
      demarrerSession(acteur, { sessionId: session.id }),
      reclamerNom({ ticket: emettreTicket(session.id), jetonAppareil: null }, { etudiantId: hugo.id }),
    ]);
    expect(demarrage.status).toBe("fulfilled");
    const [pHugo] = await db()
      .select()
      .from(participation)
      .where(and(eq(participation.sessionId, session.id), eq(participation.etudiantId, hugo.id)));
    if (reclamation.status === "fulfilled") {
      // Réclamation d'abord : le démarrage a trouvé Hugo et l'a fait partir avec les autres.
      expect(pHugo?.statut).toBe("en_cours");
    } else {
      expect(reclamation.reason).toMatchObject({ code: "ETAT", message: MESSAGES_SESSION.sessionDemarree });
      expect(pHugo).toBeUndefined();
    }
  });

  it("session d'un autre compte : introuvable, refus journalisé", async () => {
    const { session } = await salle();
    const intrus = acteurDe(await creerUtilisateur());
    await expect(demarrerSession(intrus, { sessionId: session.id })).rejects.toMatchObject({
      code: "INTROUVABLE",
    });
    expect(await refusDe(intrus.id)).toHaveLength(1);
  });
});

describe("retirerParticipant", () => {
  it("retire un participant en salle d'attente, avec ses demandes, et journalise", async () => {
    const { acteur, session, lea } = await salle();
    const { participation: p } = await creerParticipationTest(session.id, lea.id);
    await creerDemandeTest(p.id);
    await retirerParticipant(acteur, { participationId: p.id });
    expect(await db().select().from(participation).where(eq(participation.id, p.id))).toEqual([]);
    expect(
      await db().select().from(demandeAppareil).where(eq(demandeAppareil.participationId, p.id)),
    ).toEqual([]);
    expect(await entree("sessions.retirer_participant", `participation:${p.id}`)).toMatchObject({
      details: { sessionId: session.id },
    });
    await expect(retirerParticipant(acteur, { participationId: p.id })).rejects.toMatchObject({
      code: "INTROUVABLE",
      message: "Participant introuvable.",
    });
  });

  it("refuse pendant l'examen, et le participant d'un autre compte", async () => {
    const { acteur, session, lea } = await salle();
    const { participation: p } = await creerParticipationTest(session.id, lea.id);
    await db()
      .update(sessionExamen)
      .set({ statut: "en_cours", demarreLe: new Date(INSTANT_CODE_TEST) })
      .where(eq(sessionExamen.id, session.id));
    await expect(retirerParticipant(acteur, { participationId: p.id })).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_SESSION.retraitImpossible,
    });
    const intrus = acteurDe(await creerUtilisateur());
    await expect(retirerParticipant(intrus, { participationId: p.id })).rejects.toMatchObject({
      code: "INTROUVABLE",
    });
    expect(await refusDe(intrus.id)).toHaveLength(1);
  });
});

describe("demandes d'appareil", () => {
  it("autoriser : le nouveau téléphone prend la participation, l'ancien est remplacé", async () => {
    const { acteur, p, d, jetonPremier, jetonSecond } = await demandeEnAttente();
    await autoriserDemande(acteur, { demandeId: d.id });
    const [apres] = await db().select().from(participation).where(eq(participation.id, p.id));
    expect(apres?.appareilJetonHash).toBe(sha256Hex(jetonSecond));
    const [decidee] = await db().select().from(demandeAppareil).where(eq(demandeAppareil.id, d.id));
    expect(decidee).toMatchObject({
      statut: "autorisee",
      traiteePar: acteur.id,
      ancienJetonHash: sha256Hex(jetonPremier),
    });
    expect((await lireEtatEntree({ ticket: null, jetonAppareil: jetonSecond })).etat).toMatchObject({
      etape: "information",
    });
    expect((await lireEtatEntree({ ticket: null, jetonAppareil: jetonPremier })).etat).toMatchObject({
      etape: "remplace",
    });
    expect(await entree("sessions.autoriser_appareil", `demande:${d.id}`)).toMatchObject({
      details: { participationId: p.id },
    });
  });

  it("note l'autorisation comme un événement serveur de la participation (A3 du lot 7)", async () => {
    const { acteur, p, d } = await demandeEnAttente();
    await autoriserDemande(acteur, { demandeId: d.id });
    const lignes = await db()
      .select({ type: evenement.type, chargement: evenement.chargement })
      .from(evenement)
      .where(eq(evenement.participationId, p.id));
    expect(lignes).toContainEqual({ type: "second_appareil", chargement: null });
    expect(lignes).toContainEqual({ type: "appareil_autorise", chargement: null });
  });

  it("refuser : la participation garde son téléphone, le demandeur voit le refus", async () => {
    const { acteur, p, d, jetonPremier, jetonSecond } = await demandeEnAttente();
    await refuserDemande(acteur, { demandeId: d.id });
    const [apres] = await db().select().from(participation).where(eq(participation.id, p.id));
    expect(apres?.appareilJetonHash).toBe(sha256Hex(jetonPremier));
    expect((await lireEtatEntree({ ticket: null, jetonAppareil: jetonSecond })).etat).toMatchObject({
      etape: "demande",
      statut: "refusee",
    });
    expect(await entree("sessions.refuser_appareil", `demande:${d.id}`)).toBeDefined();
  });

  it("refuse une demande déjà traitée, expirée, ou d'une session terminée", async () => {
    const { acteur, session, p, d } = await demandeEnAttente();
    await refuserDemande(acteur, { demandeId: d.id });
    await expect(autoriserDemande(acteur, { demandeId: d.id })).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_SESSION.demandeTraitee,
    });
    const { demande: ancienne } = await creerDemandeTest(p.id, {
      creeLe: new Date(INSTANT_CODE_TEST - 600_000),
    });
    await expect(autoriserDemande(acteur, { demandeId: ancienne.id })).rejects.toMatchObject({
      message: MESSAGES_SESSION.demandeExpiree,
    });
    await db().update(sessionExamen).set({ statut: "terminee" }).where(eq(sessionExamen.id, session.id));
    await expect(refuserDemande(acteur, { demandeId: ancienne.id })).rejects.toMatchObject({
      message: MESSAGES_SESSION.terminee,
    });
  });

  it("demande d'une session d'un autre compte : introuvable, refus journalisés", async () => {
    const { d } = await demandeEnAttente();
    const intrus = acteurDe(await creerUtilisateur());
    await expect(autoriserDemande(intrus, { demandeId: d.id })).rejects.toMatchObject({
      code: "INTROUVABLE",
      message: "Demande introuvable.",
    });
    await expect(refuserDemande(intrus, { demandeId: d.id })).rejects.toMatchObject({ code: "INTROUVABLE" });
    expect(await refusDe(intrus.id)).toHaveLength(2);
  });
});

describe("prolongerSession et terminerSession", () => {
  it("prolonge un examen en cours et le journalise", async () => {
    const x = await examenEnCours(horloge);
    horloge.fixer(x.demarreLe.getTime() + 60_000);
    await expect(prolongerSession(x.acteur, { sessionId: x.session.id, minutes: 10 })).resolves.toEqual({
      participants: 3,
    });
    expect(await entree("sessions.prolonger", `session:${x.session.id}`)).toMatchObject({
      acteurId: x.acteur.id,
      details: { minutes: 10, participants: 3 },
    });
  });

  it("refuse une durée hors bornes, une session en attente ou terminée, et la session d'un autre compte", async () => {
    const x = await examenEnCours(horloge);
    for (const minutes of [0, 61, 2.5]) {
      await expect(prolongerSession(x.acteur, { sessionId: x.session.id, minutes })).rejects.toMatchObject({
        code: "VALIDATION",
      });
    }
    const intrus = acteurDe(await creerUtilisateur());
    await expect(prolongerSession(intrus, { sessionId: x.session.id, minutes: 5 })).rejects.toMatchObject({
      code: "INTROUVABLE",
    });
    await expect(terminerSession(intrus, { sessionId: x.session.id })).rejects.toMatchObject({
      code: "INTROUVABLE",
    });
    expect((await refusDe(intrus.id)).map((r) => (r.details as { action?: string }).action)).toEqual([
      "sessions.prolonger",
      "sessions.terminer",
    ]);
    const s = await salle();
    await expect(prolongerSession(s.acteur, { sessionId: s.session.id, minutes: 5 })).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_SESSION.pasDemarree,
    });
    await expect(terminerSession(s.acteur, { sessionId: s.session.id })).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_SESSION.pasDemarree,
    });
    await cloturerSiFinie(x.session.id, horloge.maintenant(), { forcer: true });
    await expect(terminerSession(x.acteur, { sessionId: x.session.id })).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_SESSION.terminee,
    });
  });

  it("refuse de prolonger un examen en chrono par question", async () => {
    const x = await examenEnCours(horloge, {
      qcm: { modeChrono: "par_question", dureeGlobaleS: null, dureeQuestionS: 30 },
    });
    await expect(prolongerSession(x.acteur, { sessionId: x.session.id, minutes: 5 })).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_EXAMEN.prolongerGlobal,
    });
  });

  it("termine l'examen pour tous et le journalise", async () => {
    const x = await examenEnCours(horloge);
    horloge.fixer(x.demarreLe.getTime() + 60_000);
    await expect(terminerSession(x.acteur, { sessionId: x.session.id })).resolves.toEqual({
      participants: 3,
    });
    const [s] = await db().select().from(sessionExamen).where(eq(sessionExamen.id, x.session.id));
    expect(s?.statut).toBe("terminee");
    const passages = await db().select().from(participation).where(eq(participation.sessionId, x.session.id));
    expect(passages.every((p) => p.statut === "terminee")).toBe(true);
    expect(await entree("sessions.terminer", `session:${x.session.id}`)).toMatchObject({
      acteurId: x.acteur.id,
      details: { participants: 3 },
    });
    expect((await entree("examen.cloturer_session", `session:${x.session.id}`))?.details).toEqual({
      participants: 3,
      forcee: true,
    });
  });
});
