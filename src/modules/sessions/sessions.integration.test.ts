import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { classe as tableClasse, journal, parametres, participation, sessionExamen } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { creerClasseTest, creerEtudiantTest } from "@/test/classes";
import { acteurDe, creerUtilisateur } from "@/test/comptes";
import { creerQcmTest, creerQuestionTest } from "@/test/qcm";
import { creerParticipationTest, creerSessionTest, preparerSession, renseignerRgpd } from "@/test/sessions";
import { MESSAGES_SESSION } from "./commun";
import {
  annulerSession,
  creerSession,
  listerSessions,
  lireSession,
  optionsNouvelleSession,
  type SaisieSession,
} from "./sessions";

/** 21/09/2026 14:13:20 UTC (16:13:20 à Paris). */
const INSTANT = 1_790_000_000_000;
const MOINS = String.fromCharCode(0x2212);

beforeEach(() => definirHorlogePourLesTests(horlogeFixe(INSTANT)));
afterEach(() => definirHorlogePourLesTests());

/** Enseignant avec un QCM prêt et une classe d'un étudiant ; conservation renseignée sauf `rgpd: false`. */
async function enseignantPret(rgpd = true) {
  if (rgpd) await renseignerRgpd();
  else await db().delete(parametres);
  const u = await creerUtilisateur();
  const acteur = acteurDe(u);
  const qcm = await creerQcmTest(u.id, { statut: "pret", modeChrono: "global", dureeGlobaleS: 1200 });
  await creerQuestionTest(qcm.id);
  const classe = await creerClasseTest(u.id, { nom: "TD2" });
  await creerEtudiantTest(classe.id, { nom: "Dupont", prenom: "Léa" });
  return { u, acteur, qcm, classe };
}

function saisie(qcmId: string, classeId: string, valeurs: Partial<SaisieSession> = {}): SaisieSession {
  return { qcmId, classeId, creneauPrevu: "", noteVisible: true, correctionVisible: false, ...valeurs };
}

async function entrees(action: string) {
  return db().select().from(journal).where(eq(journal.action, action));
}

describe("optionsNouvelleSession", () => {
  it("propose les QCM prêts et les classes non archivées qui ont des étudiants", async () => {
    const { u, acteur, qcm, classe } = await enseignantPret();
    await creerQcmTest(u.id, { statut: "brouillon" });
    await creerQcmTest(u.id, { statut: "archive" });
    const archivee = await creerClasseTest(u.id, { nom: "TD9", archivee: true });
    await creerEtudiantTest(archivee.id);
    await creerClasseTest(u.id, { nom: "TD vide" });
    const options = await optionsNouvelleSession(acteur);
    expect(options.qcm.map((q) => q.id)).toEqual([qcm.id]);
    expect(options.qcm[0]).toMatchObject({
      nombreQuestions: 1,
      noteVisibleDefaut: true,
      correctionVisibleDefaut: false,
    });
    expect(options.classes).toEqual([{ id: classe.id, nom: "TD2", effectif: 1 }]);
    expect(options.rgpdComplet).toBe(true);
  });
});

describe("creerSession", () => {
  it("crée une session en salle d'attente, avec un secret de code, et la journalise sans nom", async () => {
    const { acteur, qcm, classe } = await enseignantPret();
    const { id } = await creerSession(acteur, saisie(qcm.id, classe.id, { correctionVisible: true }));
    const [creee] = await db().select().from(sessionExamen).where(eq(sessionExamen.id, id));
    expect(creee).toMatchObject({
      statut: "attente",
      enseignantId: acteur.id,
      noteVisible: true,
      correctionVisible: true,
      creneauPrevuLe: null,
    });
    expect(creee?.codeSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [entree] = await entrees("sessions.creer");
    expect(entree).toMatchObject({ cible: `session:${id}`, details: { qcmId: qcm.id, classeId: classe.id } });
  });

  it("lit le créneau en heure de Paris", async () => {
    const { acteur, qcm, classe } = await enseignantPret();
    const { id } = await creerSession(
      acteur,
      saisie(qcm.id, classe.id, { creneauPrevu: "2026-09-22T08:30" }),
    );
    const [creee] = await db().select().from(sessionExamen).where(eq(sessionExamen.id, id));
    expect(creee?.creneauPrevuLe?.toISOString()).toBe("2026-09-22T06:30:00.000Z");
  });

  it("refuse un créneau illisible, passé de plus de 24 h ou à plus d'un an", async () => {
    const { acteur, qcm, classe } = await enseignantPret();
    for (const [creneauPrevu, message] of [
      ["demain", MESSAGES_SESSION.creneauInvalide],
      ["2026-09-19T08:00", MESSAGES_SESSION.creneauPasse],
      ["2027-12-01T08:00", MESSAGES_SESSION.creneauLointain],
    ] as const) {
      await expect(creerSession(acteur, saisie(qcm.id, classe.id, { creneauPrevu }))).rejects.toMatchObject({
        code: "VALIDATION",
        details: [{ chemin: "creneauPrevu", message }],
      });
    }
  });

  it("refuse un QCM qui n'est pas prêt, une classe archivée ou vide", async () => {
    const { u, acteur, qcm, classe } = await enseignantPret();
    const brouillon = await creerQcmTest(u.id, { statut: "brouillon" });
    await expect(creerSession(acteur, saisie(brouillon.id, classe.id))).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_SESSION.qcmPasPret,
    });
    const vide = await creerClasseTest(u.id, { nom: "Vide" });
    await expect(creerSession(acteur, saisie(qcm.id, vide.id))).rejects.toMatchObject({
      message: MESSAGES_SESSION.classeVide,
    });
    await db().update(tableClasse).set({ archivee: true }).where(eq(tableClasse.id, classe.id));
    await expect(creerSession(acteur, saisie(qcm.id, classe.id))).rejects.toMatchObject({
      message: MESSAGES_SESSION.classeArchivee,
    });
  });

  it("refuse tant que la conservation des données n'est pas renseignée (spec §9.4)", async () => {
    const { acteur, qcm, classe } = await enseignantPret(false);
    await expect(creerSession(acteur, saisie(qcm.id, classe.id))).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_SESSION.rgpd,
    });
  });

  it("refuse le QCM ou la classe d'un autre compte : introuvable, refus journalisé", async () => {
    const { acteur, qcm, classe } = await enseignantPret();
    const autre = await enseignantPret();
    await expect(creerSession(acteur, saisie(autre.qcm.id, classe.id))).rejects.toMatchObject({
      code: "INTROUVABLE",
      message: "QCM introuvable.",
    });
    await expect(creerSession(acteur, saisie(qcm.id, autre.classe.id))).rejects.toMatchObject({
      code: "INTROUVABLE",
      message: "Classe introuvable.",
    });
    const refus = await db()
      .select()
      .from(journal)
      .where(and(eq(journal.action, "acces.refus"), eq(journal.acteurId, acteur.id)));
    expect(refus).toHaveLength(2);
    expect(refus[0]?.details).toMatchObject({ action: "sessions.creer", motif: "ressource_autrui" });
  });

  it("limite les sessions ouvertes à 50 par compte", async () => {
    const { u, acteur, qcm, classe } = await enseignantPret();
    const ouvertes: Awaited<ReturnType<typeof creerSessionTest>>[] = [];
    for (let i = 0; i < 50; i++) ouvertes.push(await creerSessionTest(u.id, qcm.id, classe.id));
    await expect(creerSession(acteur, saisie(qcm.id, classe.id))).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_SESSION.limite,
    });
    const premiere = ouvertes[0];
    if (!premiere) throw new Error("session absente");
    await db().update(sessionExamen).set({ statut: "annulee" }).where(eq(sessionExamen.id, premiere.id));
    await expect(creerSession(acteur, saisie(qcm.id, classe.id))).resolves.toHaveProperty("id");
  });
});

describe("listerSessions", () => {
  it("classe les sessions : en cours, puis en attente par créneau, puis passées, avec leurs effectifs", async () => {
    const { enseignant, acteur, qcm, classe, session, etudiants } = await preparerSession();
    const lea = etudiants[0];
    if (!lea) throw new Error("étudiant absent");
    await creerParticipationTest(session.id, lea.id);
    const heure = (h: number) => new Date(INSTANT + h * 3_600_000);
    const tot = await creerSessionTest(enseignant.id, qcm.id, classe.id, { creneauPrevuLe: heure(1) });
    const tard = await creerSessionTest(enseignant.id, qcm.id, classe.id, { creneauPrevuLe: heure(5) });
    const enCours = await creerSessionTest(enseignant.id, qcm.id, classe.id, {
      statut: "en_cours",
      demarreLe: heure(-1),
    });
    const ancienne = await creerSessionTest(enseignant.id, qcm.id, classe.id, {
      statut: "annulee",
      termineLe: heure(-48),
    });
    const recente = await creerSessionTest(enseignant.id, qcm.id, classe.id, {
      statut: "terminee",
      termineLe: heure(-2),
    });
    const liste = await listerSessions(acteur);
    expect(liste.map((s) => s.id)).toEqual([
      enCours.id,
      tot.id,
      tard.id,
      session.id,
      recente.id,
      ancienne.id,
    ]);
    expect(liste.find((s) => s.id === session.id)).toMatchObject({
      titre: "Algorithmique — Contrôle 2",
      classe: "TD2",
      participants: 1,
      effectif: 3,
    });
  });

  it("ne montre pas les sessions d'un autre compte", async () => {
    await preparerSession();
    const u = await creerUtilisateur();
    expect(await listerSessions(acteurDe(u))).toEqual([]);
  });
});

describe("lireSession", () => {
  it("donne l'en-tête, le résumé de l'examen et le suivi de la salle d'attente", async () => {
    const { acteur, session, etudiants } = await preparerSession();
    const lea = etudiants[0];
    if (!lea) throw new Error("étudiant absent");
    await creerParticipationTest(session.id, lea.id, { informationLue: true });
    const lue = await lireSession(acteur, { sessionId: session.id });
    expect(lue).toMatchObject({
      id: session.id,
      titre: "Algorithmique — Contrôle 2",
      classe: "TD2",
      statut: "attente",
      examen: {
        questions: 2,
        duree: "20 min",
        dureeTiersTemps: null,
        bareme: `+1 juste · ${MOINS}0,25 faux`,
      },
    });
    expect(lue.suivi.participants).toHaveLength(1);
    expect(lue.suivi.absents).toHaveLength(2);
    expect(lue.suivi.code?.code).toMatch(/^[0-9A-Z]{3} [0-9A-Z]{3}$/);
  });

  it("session d'un autre compte ou identifiant mal formé : introuvable", async () => {
    const { session } = await preparerSession();
    const intrus = acteurDe(await creerUtilisateur());
    await expect(lireSession(intrus, { sessionId: session.id })).rejects.toMatchObject({
      code: "INTROUVABLE",
      message: "Session introuvable.",
    });
    await expect(lireSession(intrus, { sessionId: "pas-un-uuid" })).rejects.toMatchObject({
      code: "INTROUVABLE",
    });
    const refus = await db().select().from(journal).where(eq(journal.acteurId, intrus.id));
    expect(refus).toHaveLength(1);
  });
});

describe("annulerSession", () => {
  it("annule une session en attente, supprime ses participations et journalise", async () => {
    const { acteur, session, etudiants } = await preparerSession();
    const lea = etudiants[0];
    if (!lea) throw new Error("étudiant absent");
    await creerParticipationTest(session.id, lea.id);
    await annulerSession(acteur, { sessionId: session.id });
    const [annulee] = await db().select().from(sessionExamen).where(eq(sessionExamen.id, session.id));
    expect(annulee).toMatchObject({ statut: "annulee" });
    expect(annulee?.termineLe?.getTime()).toBe(INSTANT);
    expect(await db().select().from(participation).where(eq(participation.sessionId, session.id))).toEqual(
      [],
    );
    const [entree] = await entrees("sessions.annuler");
    expect(entree).toMatchObject({ cible: `session:${session.id}`, details: { participantsRetires: 1 } });
  });

  it("refuse une session démarrée, et la session d'un autre compte", async () => {
    const { acteur, session } = await preparerSession({ statut: "en_cours", demarreLe: new Date(INSTANT) });
    await expect(annulerSession(acteur, { sessionId: session.id })).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_SESSION.annulationImpossible,
    });
    const autre = await preparerSession();
    await expect(annulerSession(acteur, { sessionId: autre.session.id })).rejects.toMatchObject({
      code: "INTROUVABLE",
    });
  });
});
