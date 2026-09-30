import { and, eq, inArray, like } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  demandeAppareil,
  evenement,
  journal,
  limiteur,
  parametres,
  participation,
  sessionExamen,
} from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { FORMAT_JETON, genererJeton, sha256Hex } from "@/lib/jetons";
import { creerClasseTest, creerEtudiantTest } from "@/test/classes";
import { exiger } from "@/test/comptes";
import { examenEnCours, identifiants } from "@/test/examen";
import { INSTANT_CODE_TEST, preparerSession, renseignerRgpd, SECRET_CODE_TEST } from "@/test/sessions";
import { REGLE_REJOINDRE_IP } from "./cles";
import { MESSAGES_SESSION } from "./commun";
import {
  confirmerInformation,
  envoyerEvenements,
  lireEtatEntree,
  rechercherEtudiants,
  reclamerNom,
  rejoindreSession,
  selectionnerReponses,
  validerReponse,
  type Telephone,
} from "./entree";
import { emettreTicket, lireTicket } from "./ticket";

const horloge = horlogeFixe(INSTANT_CODE_TEST);
const IP = "203.0.113.7";
const SANS_COOKIE: Telephone = { ticket: null, jetonAppareil: null };
const MOINS = String.fromCharCode(0x2212);

beforeEach(() => {
  horloge.fixer(INSTANT_CODE_TEST);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

/**
 * Session au secret de test (conservation renseignée) et ses trois premiers étudiants. Les sessions
 * ouvertes des tests précédents sont d'abord terminées : elles partagent le même secret, donc le même
 * code, et `rejoindreSession` pourrait sinon trouver l'une d'elles.
 */
async function salle(options: Parameters<typeof preparerSession>[0] = {}) {
  await db()
    .update(sessionExamen)
    .set({ statut: "terminee" })
    .where(inArray(sessionExamen.statut, ["attente", "en_cours"]));
  await renseignerRgpd();
  const prep = await preparerSession({ codeSecret: SECRET_CODE_TEST, ...options });
  const [lea, sacha, hugo] = prep.etudiants;
  if (!lea || !sacha || !hugo) throw new Error("étudiants absents");
  return { ...prep, lea, sacha, hugo };
}

/** Nouveau téléphone muni d'un ticket d'entrée pour la session. */
function telephone(sessionId: string): Telephone {
  return { ticket: emettreTicket(sessionId), jetonAppareil: null };
}

/** Réclame `etudiantId` ; renvoie le résultat et le téléphone muni de son jeton d'appareil. */
async function reclamer(t: Telephone, etudiantId: string) {
  const resultat = await reclamerNom(t, { etudiantId });
  return { resultat, telephone: { ...t, jetonAppareil: resultat.jetonAppareil ?? t.jetonAppareil } };
}

async function participationsDe(sessionId: string) {
  return db().select().from(participation).where(eq(participation.sessionId, sessionId));
}

async function demandesDe(participationId: string) {
  return db().select().from(demandeAppareil).where(eq(demandeAppareil.participationId, participationId));
}

describe("rejoindreSession", () => {
  it("un code valable pose un ticket lié à la session et mène au choix du nom", async () => {
    const { session } = await salle();
    const resultat = await rejoindreSession(SANS_COOKIE, { code: "3pd 4y2", ip: IP });
    expect(lireTicket(resultat.ticket ?? null)?.sessionId).toBe(session.id);
    expect(resultat.etat).toEqual({
      serveurMaintenant: new Date(INSTANT_CODE_TEST).toISOString(),
      etape: "nom",
      session: { titre: "Algorithmique — Contrôle 2", classe: "TD2", enseignant: "Claire Arnaud" },
      demarree: false,
    });
  });

  it("accepte le code précédent, refuse un code expiré, inconnu ou illisible", async () => {
    await salle();
    await expect(rejoindreSession(SANS_COOKIE, { code: "QXCPKC", ip: IP })).resolves.toHaveProperty("ticket");
    horloge.avancer(30_000);
    await expect(rejoindreSession(SANS_COOKIE, { code: "QXCPKC", ip: IP })).rejects.toMatchObject({
      code: "VALIDATION",
      message: MESSAGES_SESSION.codeInvalide,
    });
    await expect(rejoindreSession(SANS_COOKIE, { code: "AAAAAA", ip: IP })).rejects.toMatchObject({
      message: MESSAGES_SESSION.codeInvalide,
    });
    await expect(rejoindreSession(SANS_COOKIE, { code: "12", ip: IP })).rejects.toMatchObject({
      code: "VALIDATION",
      message: MESSAGES_SESSION.codeFormat,
    });
  });

  it("pendant l'examen, le code mène au choix du nom pour une reprise (amendement A1)", async () => {
    await salle({ statut: "en_cours", demarreLe: new Date(INSTANT_CODE_TEST) });
    const resultat = await rejoindreSession(SANS_COOKIE, { code: "3PD4Y2", ip: IP });
    expect(resultat.etat).toMatchObject({ etape: "nom", demarree: true });
  });

  it("limite les essais par IP (600 par minute, amendement A4), et journalise le dépassement", async () => {
    await salle();
    // Adresse propre à ce test : les essais des tests précédents (même fenêtre d'une minute) ne comptent pas.
    const ipLimitee = "198.51.100.1";
    for (let i = 0; i < REGLE_REJOINDRE_IP.seuil; i++) {
      await expect(rejoindreSession(SANS_COOKIE, { code: "AAAAAA", ip: ipLimitee })).rejects.toMatchObject({
        code: "VALIDATION",
      });
    }
    await expect(rejoindreSession(SANS_COOKIE, { code: "3PD4Y2", ip: ipLimitee })).rejects.toMatchObject({
      code: "LIMITE_ATTEINTE",
    });
    await expect(
      rejoindreSession(SANS_COOKIE, { code: "3PD4Y2", ip: "203.0.113.8" }),
    ).resolves.toHaveProperty("ticket");
    const entrees = await db().select().from(journal).where(eq(journal.action, "sessions.limite_rejoindre"));
    expect(entrees.length).toBeGreaterThan(0);
  });
});

describe("rechercherEtudiants", () => {
  it("trouve le début du nom ou du prénom, sans tenir compte des accents ni de la casse", async () => {
    const { session } = await salle();
    const t = telephone(session.id);
    const noms = async (debut: string) =>
      (await rechercherEtudiants(t, { debut })).etudiants.map((e) => `${e.prenom} ${e.nom}`);
    expect(await noms("dup")).toEqual(["Léa Dupont", "Sacha Dupré", "Hugo Dupuis"]);
    expect(await noms("LEA")).toEqual(["Léa Dupont"]);
    expect(await noms("dupré sa")).toEqual(["Sacha Dupré"]);
    expect(await noms("Léa Dup")).toEqual(["Léa Dupont"]);
    expect(await noms("Martin")).toEqual([]);
  });

  it("renvoie 8 étudiants au plus et signale les suivants", async () => {
    const etudiants = Array.from({ length: 10 }, (_, i) => ({ nom: "Martin", prenom: `Élève ${i + 1}` }));
    const { session } = await salle({ etudiants });
    const resultat = await rechercherEtudiants(telephone(session.id), { debut: "mar" });
    expect(resultat.etudiants).toHaveLength(8);
    expect(resultat.autres).toBe(true);
  });

  it("refuse une saisie de moins de 3 lettres, une fois normalisée", async () => {
    const { session } = await salle();
    await expect(rechercherEtudiants(telephone(session.id), { debut: "d'" })).rejects.toMatchObject({
      code: "VALIDATION",
      message: MESSAGES_SESSION.rechercheCourte,
    });
  });

  it("exige un ticket valable, et une session ni annulée ni terminée", async () => {
    const { session } = await salle();
    await expect(rechercherEtudiants(SANS_COOKIE, { debut: "dup" })).rejects.toMatchObject({
      code: "ETAT",
      details: { raison: "ticket" },
    });
    const t = telephone(session.id);
    horloge.avancer(600_000);
    await expect(rechercherEtudiants(t, { debut: "dup" })).rejects.toMatchObject({
      message: MESSAGES_SESSION.ticketExpire,
    });
    await db().update(sessionExamen).set({ statut: "annulee" }).where(eq(sessionExamen.id, session.id));
    await expect(rechercherEtudiants(telephone(session.id), { debut: "dup" })).rejects.toMatchObject({
      message: MESSAGES_SESSION.sessionAnnuleeEtudiant,
    });
  });
});

describe("reclamerNom", () => {
  it("crée la participation, pose un jeton d'appareil et mène à l'information", async () => {
    const { session, lea } = await salle();
    const { resultat } = await reclamer(telephone(session.id), lea.id);
    const jeton = exiger(resultat.jetonAppareil, "jeton");
    expect(jeton).toMatch(FORMAT_JETON);
    const [p] = await participationsDe(session.id);
    expect(p).toMatchObject({ etudiantId: lea.id, appareilJetonHash: sha256Hex(jeton), statut: "attente" });
    expect(resultat.etat).toMatchObject({
      etape: "information",
      prenom: "Léa",
      information: {
        conservationEvenementsJours: 30,
        conservationResultatsJours: 365,
        contact: "Direction des études (exemple)",
      },
    });
  });

  it("le même téléphone qui réclame de nouveau reprend sa participation sans rien écrire", async () => {
    const { session, lea } = await salle();
    const premier = await reclamer(telephone(session.id), lea.id);
    const encore = await reclamerNom(premier.telephone, { etudiantId: lea.id });
    expect(encore.jetonAppareil).toBeUndefined();
    expect(encore.etat.etape).toBe("information");
    const participations = await participationsDe(session.id);
    expect(participations).toHaveLength(1);
    expect(await demandesDe(exiger(participations[0], "participation").id)).toEqual([]);
  });

  it("un autre téléphone crée une demande d'appareil, un événement et une entrée de journal anonyme", async () => {
    const { session, lea } = await salle();
    await reclamer(telephone(session.id), lea.id);
    const { resultat } = await reclamer(telephone(session.id), lea.id);
    expect(resultat.etat).toMatchObject({
      etape: "demande",
      statut: "en_attente",
      motif: "second_appareil",
      etudiantId: lea.id,
    });
    const p = exiger((await participationsDe(session.id))[0], "participation");
    expect(await demandesDe(p.id)).toMatchObject([
      { jetonHash: sha256Hex(exiger(resultat.jetonAppareil, "jeton")), statut: "en_attente" },
    ]);
    const evenements = await db().select().from(evenement).where(eq(evenement.participationId, p.id));
    expect(evenements).toMatchObject([{ type: "second_appareil", details: { motif: "second_appareil" } }]);
    const [entree] = await db()
      .select()
      .from(journal)
      .where(
        and(eq(journal.action, "sessions.demander_appareil"), eq(journal.cible, `participation:${p.id}`)),
      );
    expect(entree).toMatchObject({ acteurType: "anonyme", details: { motif: "second_appareil" } });
  });

  it("une demande en attente : sans effet depuis le même téléphone, refusée depuis un troisième", async () => {
    const { session, lea } = await salle();
    await reclamer(telephone(session.id), lea.id);
    const second = await reclamer(telephone(session.id), lea.id);
    const encore = await reclamerNom(second.telephone, { etudiantId: lea.id });
    expect(encore.jetonAppareil).toBeUndefined();
    expect(encore.etat).toMatchObject({ etape: "demande", statut: "en_attente" });
    await expect(reclamerNom(telephone(session.id), { etudiantId: lea.id })).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_SESSION.demandeEnAttente,
    });
    const p = exiger((await participationsDe(session.id))[0], "participation");
    expect(await demandesDe(p.id)).toHaveLength(1);
  });

  it("une demande restée 10 minutes sans réponse expire et peut être renouvelée", async () => {
    const { session, lea } = await salle();
    await reclamer(telephone(session.id), lea.id);
    await reclamer(telephone(session.id), lea.id);
    horloge.avancer(600_000);
    const troisieme = await reclamer(telephone(session.id), lea.id);
    expect(troisieme.resultat.etat).toMatchObject({ etape: "demande", statut: "en_attente" });
    const p = exiger((await participationsDe(session.id))[0], "participation");
    expect((await demandesDe(p.id)).map((d) => d.statut).sort()).toEqual(["en_attente", "expiree"]);
  });

  it("pendant l'examen : aucune nouvelle participation, mais une demande de reprise", async () => {
    const { session, lea, hugo } = await salle();
    await reclamer(telephone(session.id), lea.id);
    await db()
      .update(sessionExamen)
      .set({ statut: "en_cours", demarreLe: new Date(INSTANT_CODE_TEST) })
      .where(eq(sessionExamen.id, session.id));
    await expect(reclamerNom(telephone(session.id), { etudiantId: hugo.id })).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_SESSION.sessionDemarree,
    });
    const { resultat } = await reclamer(telephone(session.id), lea.id);
    expect(resultat.etat).toMatchObject({ etape: "demande", motif: "reprise" });
  });

  it("refuse un second nom sur un téléphone déjà associé, et un étudiant d'une autre classe", async () => {
    const { session, lea, hugo, enseignant } = await salle();
    const premier = await reclamer(telephone(session.id), lea.id);
    await expect(reclamerNom(premier.telephone, { etudiantId: hugo.id })).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_SESSION.telephoneDejaAssocie,
    });
    const autreClasse = await creerClasseTest(enseignant.id, { nom: "TD3" });
    const intrus = await creerEtudiantTest(autreClasse.id, { nom: "Martin", prenom: "Inès" });
    await expect(reclamerNom(telephone(session.id), { etudiantId: intrus.id })).rejects.toMatchObject({
      code: "INTROUVABLE",
      message: "Étudiant introuvable.",
    });
  });

  it("refuse la demande d'un téléphone déjà associé à un autre nom (étape 6, D9)", async () => {
    const { session, lea, sacha } = await salle();
    const premier = await reclamer(telephone(session.id), lea.id);
    await reclamer(telephone(session.id), sacha.id);
    await expect(reclamerNom(premier.telephone, { etudiantId: sacha.id })).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_SESSION.telephoneDejaAssocie,
    });
    const pSacha = exiger(
      (await participationsDe(session.id)).find((p) => p.etudiantId === sacha.id),
      "participation de Sacha",
    );
    expect(await demandesDe(pSacha.id)).toEqual([]);
    const evenements = await db().select().from(evenement).where(eq(evenement.participationId, pSacha.id));
    expect(evenements).toEqual([]);
  });

  it("refuse une session annulée et un téléphone sans ticket", async () => {
    const { session, lea } = await salle();
    const t = telephone(session.id);
    await db().update(sessionExamen).set({ statut: "annulee" }).where(eq(sessionExamen.id, session.id));
    await expect(reclamerNom(t, { etudiantId: lea.id })).rejects.toMatchObject({
      message: MESSAGES_SESSION.sessionAnnuleeEtudiant,
    });
    await expect(reclamerNom(SANS_COOKIE, { etudiantId: lea.id })).rejects.toMatchObject({
      details: { raison: "ticket" },
    });
  });

  it("deux téléphones réclament le même nom au même instant : une participation et une demande", async () => {
    const { session, lea } = await salle();
    const resultats = await Promise.all([
      reclamerNom(telephone(session.id), { etudiantId: lea.id }),
      reclamerNom(telephone(session.id), { etudiantId: lea.id }),
    ]);
    expect(resultats.map((r) => r.etat.etape).sort()).toEqual(["demande", "information"]);
    const participations = await participationsDe(session.id);
    expect(participations).toHaveLength(1);
    expect(await demandesDe(exiger(participations[0], "participation").id)).toHaveLength(1);
  });

  it("limite les réclamations à 10 par minute et par ticket", async () => {
    const { session } = await salle();
    const t = telephone(session.id);
    for (let i = 0; i < 10; i++) {
      await expect(reclamerNom(t, { etudiantId: "inconnu" })).rejects.toMatchObject({ code: "INTROUVABLE" });
    }
    await expect(reclamerNom(t, { etudiantId: "inconnu" })).rejects.toMatchObject({
      code: "LIMITE_ATTEINTE",
    });
  });
});

describe("confirmerInformation", () => {
  it("enregistre la lecture une seule fois et mène à la salle d'attente", async () => {
    const { session, lea } = await salle();
    const { telephone: t } = await reclamer(telephone(session.id), lea.id);
    const resultat = await confirmerInformation(t);
    expect(resultat.etat).toMatchObject({
      etape: "attente",
      prenom: "Léa",
      connectes: 1,
      session: { enseignant: "Claire Arnaud" },
      examen: {
        questions: 2,
        duree: "20 min",
        dureeTiersTemps: null,
        bareme: `+1 juste · ${MOINS}0,25 faux`,
      },
    });
    horloge.avancer(60_000);
    await confirmerInformation(t);
    const [p] = await participationsDe(session.id);
    expect(p?.informationLueLe?.getTime()).toBe(INSTANT_CODE_TEST);
  });

  it("donne la durée allongée à un étudiant en tiers-temps", async () => {
    const { session, hugo: enzo } = await salle({
      etudiants: [
        { nom: "Dupont", prenom: "Léa" },
        { nom: "Dupré", prenom: "Sacha" },
        { nom: "Girard", prenom: "Enzo", tiersTemps: true },
      ],
    });
    const { telephone: t } = await reclamer(telephone(session.id), enzo.id);
    expect((await confirmerInformation(t)).etat).toMatchObject({
      etape: "attente",
      examen: { dureeTiersTemps: "26 min 40 s" },
    });
  });

  it("refuse un téléphone sans participation", async () => {
    const { session } = await salle();
    await expect(confirmerInformation(telephone(session.id))).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_SESSION.participationIntrouvable,
    });
    await expect(confirmerInformation({ ticket: null, jetonAppareil: genererJeton() })).rejects.toMatchObject(
      {
        message: MESSAGES_SESSION.participationIntrouvable,
      },
    );
  });

  it("refuse tant que la conservation des données n'est pas renseignée", async () => {
    const { session, lea } = await salle();
    const { telephone: t } = await reclamer(telephone(session.id), lea.id);
    await db().delete(parametres);
    await expect(confirmerInformation(t)).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_SESSION.informationIndisponible,
    });
  });
});

describe("lireEtatEntree", () => {
  it("sans cookie : la saisie du code ; avec un ticket seul : le choix du nom", async () => {
    const { session } = await salle();
    expect((await lireEtatEntree(SANS_COOKIE)).etat).toEqual({
      serveurMaintenant: new Date(INSTANT_CODE_TEST).toISOString(),
      etape: "code",
    });
    expect((await lireEtatEntree(telephone(session.id))).etat).toMatchObject({
      etape: "nom",
      demarree: false,
    });
  });

  it("note le dernier contact du téléphone et donne l'heure du départ commun", async () => {
    const { session, lea } = await salle();
    const { telephone: t } = await reclamer(telephone(session.id), lea.id);
    await confirmerInformation(t);
    horloge.avancer(5_000);
    await lireEtatEntree(t);
    const [p] = await participationsDe(session.id);
    expect(p?.dernierContactLe.getTime()).toBe(INSTANT_CODE_TEST + 5_000);
    const demarreLe = new Date(INSTANT_CODE_TEST + 10_000);
    await db()
      .update(sessionExamen)
      .set({ statut: "en_cours", demarreLe })
      .where(eq(sessionExamen.id, session.id));
    expect((await lireEtatEntree(t)).etat).toMatchObject({
      etape: "demarrage",
      prenom: "Léa",
      demarreLe: demarreLe.toISOString(),
    });
  });

  it("suit la demande d'un second téléphone : en attente, refusée, puis expirée", async () => {
    const { session, lea } = await salle();
    await reclamer(telephone(session.id), lea.id);
    const second = await reclamer(telephone(session.id), lea.id);
    expect((await lireEtatEntree(second.telephone)).etat).toMatchObject({
      etape: "demande",
      statut: "en_attente",
    });
    const p = exiger((await participationsDe(session.id))[0], "participation");
    await db()
      .update(demandeAppareil)
      .set({ statut: "refusee" })
      .where(eq(demandeAppareil.participationId, p.id));
    expect((await lireEtatEntree(second.telephone)).etat).toMatchObject({
      etape: "demande",
      statut: "refusee",
    });
    const troisieme = await reclamer(telephone(session.id), lea.id);
    horloge.avancer(600_000);
    expect((await lireEtatEntree(troisieme.telephone)).etat).toMatchObject({
      etape: "demande",
      statut: "expiree",
    });
  });

  it("l'ancien téléphone apprend qu'un autre l'a remplacé", async () => {
    const { session, lea } = await salle();
    const premier = await reclamer(telephone(session.id), lea.id);
    const second = await reclamer(telephone(session.id), lea.id);
    const p = exiger((await participationsDe(session.id))[0], "participation");
    const d = exiger((await demandesDe(p.id))[0], "demande");
    // Autorisation telle que l'écrit autoriserDemande (tâche 8).
    await db()
      .update(participation)
      .set({ appareilJetonHash: d.jetonHash })
      .where(eq(participation.id, p.id));
    await db()
      .update(demandeAppareil)
      .set({
        statut: "autorisee",
        ancienJetonHash: p.appareilJetonHash,
        traiteeLe: new Date(INSTANT_CODE_TEST),
      })
      .where(eq(demandeAppareil.id, d.id));
    expect((await lireEtatEntree(premier.telephone)).etat).toMatchObject({
      etape: "remplace",
      session: { classe: "TD2" },
    });
    expect((await lireEtatEntree(second.telephone)).etat).toMatchObject({
      etape: "information",
      prenom: "Léa",
    });
  });

  it("session annulée : le ticket mène à l'écran de fermeture", async () => {
    const { session } = await salle();
    const t = telephone(session.id);
    await db().update(sessionExamen).set({ statut: "annulee" }).where(eq(sessionExamen.id, session.id));
    expect((await lireEtatEntree(t)).etat).toMatchObject({ etape: "fermee", raison: "annulee" });
  });

  it("un ticket d'une autre session l'emporte sur l'ancienne participation du téléphone", async () => {
    const { session, lea } = await salle();
    const { telephone: t } = await reclamer(telephone(session.id), lea.id);
    const autre = await preparerSession();
    const { etat } = await lireEtatEntree({
      ticket: emettreTicket(autre.session.id),
      jetonAppareil: t.jetonAppareil,
    });
    expect(etat).toMatchObject({ etape: "nom" });
  });

  it("limite l'état à 120 appels par minute et par appareil", async () => {
    await salle();
    const t: Telephone = { ticket: null, jetonAppareil: genererJeton() };
    for (let i = 0; i < 120; i++) await lireEtatEntree(t);
    await expect(lireEtatEntree(t)).rejects.toMatchObject({ code: "LIMITE_ATTEINTE" });
  });

  it("un jeton d'appareil mal formé suit la branche du ticket, sans poser de clé du limiteur", async () => {
    await salle();
    // Table nettoyée : les appels d'appareil des tests précédents y ont déjà posé des clés.
    await db().delete(limiteur);
    const t: Telephone = { ticket: null, jetonAppareil: "mal-forme" };
    expect((await lireEtatEntree(t)).etat).toMatchObject({ etape: "code" });
    const lignes = await db().select().from(limiteur).where(like(limiteur.cle, "etudiant:etat:%"));
    expect(lignes).toEqual([]);
  });
});

describe("passage de l'examen par le téléphone", () => {
  function telephoneDe(jeton: string): Telephone {
    return { ticket: null, jetonAppareil: jeton };
  }

  it("sert la question après le départ, puis l'écran de fin", async () => {
    const x = await examenEnCours(horloge, { etudiants: [{ nom: "Dupont", prenom: "Léa" }] });
    const lea = x.telephones[0];
    if (!lea) throw new Error("téléphone absent");
    const t = telephoneDe(lea.jeton);
    expect((await lireEtatEntree(t)).etat).toMatchObject({
      etape: "question",
      session: { titre: "Algorithmique — Contrôle 2", classe: "TD2" },
      question: { rang: 1, total: 2 },
    });
    const apres1 = await validerReponse(t, {
      rang: 1,
      selection: await identifiants(lea.participation.id, 1, ["Oui"]),
    });
    expect(apres1.etat).toMatchObject({ etape: "question", question: { rang: 2 } });
    const apres2 = await validerReponse(t, { rang: 2, selection: [] });
    expect(apres2.etat).toMatchObject({ etape: "fin", prenom: "Léa", repondues: 1, total: 2, note: 10 });
    expect((await lireEtatEntree(t)).etat).toMatchObject({ etape: "fin" });
  });

  it("enregistre le brouillon et limite par participation, jamais pour un jeton inconnu", async () => {
    const x = await examenEnCours(horloge, { etudiants: [{ nom: "Dupont", prenom: "Léa" }] });
    const lea = x.telephones[0];
    if (!lea) throw new Error("téléphone absent");
    await expect(selectionnerReponses(telephoneDe(lea.jeton), { rang: 1, selection: [] })).resolves.toEqual({
      enregistree: true,
    });
    const cles = await db()
      .select({ cle: limiteur.cle })
      .from(limiteur)
      .where(like(limiteur.cle, "etudiant:selection:%"));
    expect(cles.map((c) => c.cle)).toContain(`etudiant:selection:${lea.participation.id}`);
    const avant = cles.length;
    for (const jeton of ["mal-forme", genererJeton()]) {
      await expect(
        selectionnerReponses(telephoneDe(jeton), { rang: 1, selection: [] }),
      ).rejects.toMatchObject({
        code: "ETAT",
        message: MESSAGES_SESSION.participationIntrouvable,
      });
      await expect(validerReponse(telephoneDe(jeton), { rang: 1, selection: [] })).rejects.toMatchObject({
        code: "ETAT",
      });
    }
    const apres = await db()
      .select({ cle: limiteur.cle })
      .from(limiteur)
      .where(like(limiteur.cle, "etudiant:selection:%"));
    expect(apres).toHaveLength(avant);
  });

  it("note un silence quand l'état n'est plus demandé pendant plus de 15 s", async () => {
    const x = await examenEnCours(horloge, { etudiants: [{ nom: "Dupont", prenom: "Léa" }] });
    const lea = x.telephones[0];
    if (!lea) throw new Error("téléphone absent");
    await lireEtatEntree(telephoneDe(lea.jeton));
    horloge.fixer(x.demarreLe.getTime() + 20_000);
    await lireEtatEntree(telephoneDe(lea.jeton));
    const silences = await db()
      .select()
      .from(evenement)
      .where(and(eq(evenement.participationId, lea.participation.id), eq(evenement.type, "silence")));
    expect(silences.map((s) => s.dureeMs)).toEqual([20_000]);
  });

  it("enregistre les événements et limite par participation, jamais pour un jeton inconnu", async () => {
    const x = await examenEnCours(horloge, { etudiants: [{ nom: "Dupont", prenom: "Léa" }] });
    const lea = x.telephones[0];
    if (!lea) throw new Error("téléphone absent");
    const lot = { chargement: "chargement-a1", evenements: [{ n: 1, type: "debut" }] };
    await expect(envoyerEvenements(telephoneDe(lea.jeton), lot)).resolves.toEqual({ enregistres: 1 });
    const cles = await db()
      .select({ cle: limiteur.cle })
      .from(limiteur)
      .where(like(limiteur.cle, "etudiant:evenements:%"));
    expect(cles.map((c) => c.cle)).toEqual([`etudiant:evenements:${lea.participation.id}`]);
    for (const jeton of ["mal-forme", genererJeton()]) {
      await expect(envoyerEvenements(telephoneDe(jeton), lot)).rejects.toMatchObject({ code: "ETAT" });
    }
    const apres = await db()
      .select({ cle: limiteur.cle })
      .from(limiteur)
      .where(like(limiteur.cle, "etudiant:evenements:%"));
    expect(apres).toHaveLength(1);
  });
});
