import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { journal, qcm, sessionAutorisation, sessionExamen } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { cloturerSiFinie } from "@/modules/examen";
import { acteurDe, creerUtilisateur, exiger } from "@/test/comptes";
import { examenEnCours, examenTermine } from "@/test/examen";
import { creerParticipationTest, INSTANT_CODE_TEST } from "@/test/sessions";
import { MESSAGES_SESSION } from "./commun";
import { rechercherEtudiants, reclamerNom } from "./entree";
import { demarrerSession } from "./pilotage";
import { creerRattrapage, situationsExamen } from "./rattrapage";
import { annulerSession, listerSessions } from "./sessions";
import { suivreSession } from "./suivi";
import { emettreTicket } from "./ticket";

const horloge = horlogeFixe(INSTANT_CODE_TEST);

beforeEach(() => {
  horloge.fixer(INSTANT_CODE_TEST);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

async function sessionEnBase(id: string) {
  const [s] = await db().select().from(sessionExamen).where(eq(sessionExamen.id, id));
  return exiger(s, "session");
}

function etatDe(
  situations: Awaited<ReturnType<typeof situationsExamen>>,
  etudiantId: string,
): string | undefined {
  return situations.get(etudiantId)?.etat;
}

describe("situationsExamen (D2)", () => {
  it("distingue les étudiants passés, prévus en rattrapage et absents", async () => {
    const x = await examenTermine(horloge);
    const racine = { id: x.session.id, classeId: x.classe.id };
    const [ines, tom] = x.absents;
    let situations = await situationsExamen(db(), racine);
    for (const t of x.telephones) {
      expect(situations.get(t.etudiant.id)).toMatchObject({
        etat: "passe",
        participationId: t.participation.id,
        sessionId: x.session.id,
        statut: "terminee",
      });
    }
    expect(etatDe(situations, ines.id)).toBe("absent");
    expect(etatDe(situations, tom.id)).toBe("absent");

    const { id } = await creerRattrapage(x.acteur, {
      sessionId: x.session.id,
      etudiantIds: [ines.id],
      creneauPrevu: "",
    });
    situations = await situationsExamen(db(), racine);
    expect(situations.get(ines.id)).toEqual({
      etat: "prevu",
      sessionId: id,
      statut: "attente",
      creneauPrevuLe: null,
    });
    expect(etatDe(situations, tom.id)).toBe("absent");

    // Rattrapage annulé : l'étudiant redevient absent, donc rattrapable.
    await annulerSession(x.acteur, { sessionId: id });
    situations = await situationsExamen(db(), racine);
    expect(etatDe(situations, ines.id)).toBe("absent");
  });
});

describe("creerRattrapage (D3)", () => {
  it("crée un rattrapage sur l'instantané de l'origine, pour les étudiants choisis", async () => {
    const x = await examenTermine(horloge);
    const [ines, tom] = x.absents;
    const origine = await sessionEnBase(x.session.id);
    const { id } = await creerRattrapage(x.acteur, {
      sessionId: x.session.id,
      etudiantIds: [ines.id, tom.id, ines.id.toUpperCase()],
      creneauPrevu: "2026-09-30T10:00",
    });
    const cree = await sessionEnBase(id);
    expect(cree).toMatchObject({
      type: "rattrapage",
      sessionOrigineId: x.session.id,
      statut: "attente",
      qcmId: origine.qcmId,
      classeId: origine.classeId,
      enseignantId: x.acteur.id,
      noteVisible: origine.noteVisible,
      correctionVisible: origine.correctionVisible,
      creneauPrevuLe: new Date("2026-09-30T08:00:00.000Z"),
    });
    expect(cree.contenu).toEqual(origine.contenu);
    expect(cree.codeSecret).not.toBe(origine.codeSecret);
    const autorises = await db()
      .select({ etudiantId: sessionAutorisation.etudiantId })
      .from(sessionAutorisation)
      .where(eq(sessionAutorisation.sessionId, id));
    expect(autorises.map((a) => a.etudiantId).sort()).toEqual([ines.id, tom.id].sort());
    // Filtré aussi sur `cible` : la base n'est isolée que par fichier (pas par test), le test
    // précédent (D2) a déjà créé une entrée « sessions.creer_rattrapage » (écart signalé au rapport).
    const [trace] = await db()
      .select()
      .from(journal)
      .where(and(eq(journal.action, "sessions.creer_rattrapage"), eq(journal.cible, `session:${id}`)));
    expect(trace).toMatchObject({
      cible: `session:${id}`,
      details: { sessionOrigineId: x.session.id, etudiants: 2 },
    });
  });

  it("refuse un étudiant déjà passé ou déjà prévu, une origine en cours ou un rattrapage d'un rattrapage", async () => {
    const x = await examenTermine(horloge);
    const [ines, tom] = x.absents;
    const lea = exiger(x.telephones[0], "Léa").etudiant;
    const saisie = { sessionId: x.session.id, creneauPrevu: "" };
    await expect(creerRattrapage(x.acteur, { ...saisie, etudiantIds: [lea.id] })).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_SESSION.rattrapageEtudiants,
    });
    const { id } = await creerRattrapage(x.acteur, { ...saisie, etudiantIds: [ines.id] });
    await expect(
      creerRattrapage(x.acteur, { ...saisie, etudiantIds: [ines.id, tom.id] }),
    ).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_SESSION.rattrapageEtudiants,
    });
    await expect(
      creerRattrapage(x.acteur, { sessionId: id, etudiantIds: [tom.id], creneauPrevu: "" }),
    ).rejects.toMatchObject({ code: "ETAT", message: MESSAGES_SESSION.rattrapageDepuisOrigine });

    const enCours = await examenEnCours(horloge);
    const sacha = exiger(enCours.telephones[1], "Sacha").etudiant;
    await expect(
      creerRattrapage(enCours.acteur, {
        sessionId: enCours.session.id,
        etudiantIds: [sacha.id],
        creneauPrevu: "",
      }),
    ).rejects.toMatchObject({ code: "ETAT", message: MESSAGES_SESSION.rattrapageAvantFin });
  });

  it("refuse la session d'un autre compte comme une session inconnue, et une saisie vide", async () => {
    const x = await examenTermine(horloge);
    const [ines] = x.absents;
    const autre = acteurDe(await creerUtilisateur());
    await expect(
      creerRattrapage(autre, { sessionId: x.session.id, etudiantIds: [ines.id], creneauPrevu: "" }),
    ).rejects.toMatchObject({ code: "INTROUVABLE", message: "Session introuvable." });
    const refus = await db()
      .select({ details: journal.details })
      .from(journal)
      .where(and(eq(journal.action, "acces.refus"), eq(journal.acteurId, autre.id)));
    expect(refus).toEqual([
      { details: { action: "sessions.creer_rattrapage", role: "enseignant", motif: "ressource_autrui" } },
    ]);
    await expect(
      creerRattrapage(x.acteur, { sessionId: x.session.id, etudiantIds: [], creneauPrevu: "" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      creerRattrapage(x.acteur, { sessionId: x.session.id, etudiantIds: ["pas-un-uuid"], creneauPrevu: "" }),
    ).rejects.toMatchObject({ code: "INTROUVABLE", message: "Étudiant introuvable." });
  });
});

describe("vie d'un rattrapage (D4)", () => {
  it("n'ouvre la recherche et la réclamation qu'aux étudiants autorisés", async () => {
    const x = await examenTermine(horloge);
    const [ines, tom] = x.absents;
    const { id } = await creerRattrapage(x.acteur, {
      sessionId: x.session.id,
      etudiantIds: [ines.id],
      creneauPrevu: "",
    });
    const telephone = { ticket: emettreTicket(id), jetonAppareil: null };
    expect((await rechercherEtudiants(telephone, { debut: "mar" })).etudiants).toEqual([
      { id: ines.id, nom: "Martin", prenom: "Inès" },
    ]);
    expect((await rechercherEtudiants(telephone, { debut: "ber" })).etudiants).toEqual([]);
    expect((await rechercherEtudiants(telephone, { debut: "dup" })).etudiants).toEqual([]);
    await expect(reclamerNom(telephone, { etudiantId: tom.id })).rejects.toMatchObject({
      code: "INTROUVABLE",
      message: "Étudiant introuvable.",
    });
    const entree = await reclamerNom(telephone, { etudiantId: ines.id });
    expect(entree.jetonAppareil).toBeDefined();
    expect(entree.etat.etape).toBe("information");
  });

  it("attend les seuls autorisés au suivi, et les compte dans la liste des sessions", async () => {
    const x = await examenTermine(horloge);
    const [ines] = x.absents;
    const { id } = await creerRattrapage(x.acteur, {
      sessionId: x.session.id,
      etudiantIds: [ines.id],
      creneauPrevu: "",
    });
    const suivi = await suivreSession(x.acteur, { sessionId: id });
    expect(suivi.effectif).toBe(1);
    expect(suivi.absents).toEqual([{ etudiantId: ines.id, nom: "Martin", prenom: "Inès" }]);
    const liste = await listerSessions(x.acteur);
    expect(liste.find((s) => s.id === id)).toMatchObject({
      type: "rattrapage",
      effectif: 1,
      participants: 0,
    });
    expect(liste.find((s) => s.id === x.session.id)).toMatchObject({ type: "classe", effectif: 5 });
  });

  it("démarre sur l'instantané de l'origine, même si le QCM n'est plus prêt", async () => {
    const x = await examenTermine(horloge);
    const [ines] = x.absents;
    const { id } = await creerRattrapage(x.acteur, {
      sessionId: x.session.id,
      etudiantIds: [ines.id],
      creneauPrevu: "",
    });
    await db().update(qcm).set({ statut: "brouillon", titre: "Titre changé" }).where(eq(qcm.id, x.qcm.id));
    await creerParticipationTest(id, ines.id, { informationLue: true });
    const { demarreLe } = await demarrerSession(x.acteur, { sessionId: id });
    const origine = await sessionEnBase(x.session.id);
    const rattrapage = await sessionEnBase(id);
    expect(rattrapage.statut).toBe("en_cours");
    expect(rattrapage.contenu).toEqual(origine.contenu);

    horloge.fixer(new Date(demarreLe.getTime() + 30_000));
    expect(await cloturerSiFinie(id, new Date(demarreLe.getTime() + 30_000), { forcer: true })).toBe(true);
    const situations = await situationsExamen(db(), { id: x.session.id, classeId: x.classe.id });
    expect(situations.get(ines.id)).toMatchObject({ etat: "passe", sessionId: id, statut: "terminee" });
  });
});
