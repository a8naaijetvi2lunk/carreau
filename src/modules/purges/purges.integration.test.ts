import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
  etudiant,
  evenement,
  invitation,
  jetonReinitialisation,
  journal,
  limiteur,
  participation,
  sessionConnexion,
  sessionExamen,
} from "@/db/schema";
import { reinitialiserEnvPourLesTests } from "@/lib/env";
import { definirHorlogePourLesTests, horlogeFixe, maintenant } from "@/lib/horloge";
import { sha256Hex } from "@/lib/jetons";
import { creerClasseTest, creerEtudiantTest } from "@/test/classes";
import { creerUtilisateur } from "@/test/comptes";
import { utiliserDossierImagesTemporaire } from "@/test/images";
import { creerQcmTest } from "@/test/qcm";
import { creerParticipationTest, creerSessionTest, renseignerRgpd } from "@/test/sessions";
import { executerPurges } from "./purges";

const DEBUT = Date.parse("2026-09-30T02:30:00.000Z");
const MINUTE = 60 * 1000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;
const horloge = horlogeFixe(DEBUT);
utiliserDossierImagesTemporaire();

/** Chaque test part d'une base sans données purgeables (rattrapages d'abord : clé en RESTRICT). */
async function repartirDeZero(): Promise<void> {
  await db().execute(sql`delete from session_examen where session_origine_id is not null`);
  await db().execute(sql`delete from session_examen`);
  await db().execute(sql`delete from session_connexion`);
  await db().execute(sql`delete from jeton_reinitialisation`);
  await db().execute(sql`delete from invitation`);
  await db().execute(sql`delete from limiteur`);
  await db().execute(sql`delete from journal`);
  await db().execute(sql`delete from parametres`);
}

beforeEach(async () => {
  horloge.fixer(DEBUT);
  definirHorlogePourLesTests(horloge);
  await repartirDeZero();
});
afterEach(() => definirHorlogePourLesTests());

async function contexte() {
  const enseignant = await creerUtilisateur();
  const classe = await creerClasseTest(enseignant.id);
  const qcm = await creerQcmTest(enseignant.id, { statut: "pret" });
  const lea = await creerEtudiantTest(classe.id, { nom: "Dupont", prenom: "Léa" });
  return { enseignant, classe, qcm, lea };
}
type Contexte = Awaited<ReturnType<typeof contexte>>;

/** Session créée `age` ms avant DEBUT, avec une participation de Léa et un événement. */
async function sessionDeTest(
  c: Contexte,
  age: number,
  options: {
    statut: "attente" | "en_cours" | "terminee" | "annulee";
    type?: "classe" | "rattrapage";
    sessionOrigineId?: string;
  },
) {
  horloge.fixer(DEBUT - age);
  const fini = options.statut === "terminee" || options.statut === "annulee";
  const session = await creerSessionTest(c.enseignant.id, c.qcm.id, c.classe.id, {
    statut: options.statut,
    demarreLe: options.statut === "attente" ? null : maintenant(),
    termineLe: fini ? maintenant() : null,
    type: options.type ?? "classe",
    sessionOrigineId: options.sessionOrigineId ?? null,
  });
  const { participation: p } = await creerParticipationTest(session.id, c.lea.id);
  await db().insert(evenement).values({ participationId: p.id, type: "sortie", recuLe: maintenant() });
  horloge.fixer(DEBUT);
  return { session, participation: p };
}

async function sessionExiste(id: string): Promise<boolean> {
  return (
    (await db().select({ id: sessionExamen.id }).from(sessionExamen).where(eq(sessionExamen.id, id)))
      .length === 1
  );
}

async function evenementsDe(participationId: string): Promise<number> {
  return (
    await db()
      .select({ id: evenement.id })
      .from(evenement)
      .where(eq(evenement.participationId, participationId))
  ).length;
}

describe("executerPurges (décisions D1, D2 et D4 du plan du lot 10)", () => {
  it("ne touche à aucune donnée d'examen tant que la conservation n'est pas renseignée", async () => {
    const c = await contexte();
    const vieille = await sessionDeTest(c, 800 * JOUR, { statut: "terminee" });
    const bilan = await executerPurges();
    expect(bilan).toMatchObject({ conservationRenseignee: false, evenements: 0, sessions: 0, erreurs: [] });
    expect(await sessionExiste(vieille.session.id)).toBe(true);
    expect(await evenementsDe(vieille.participation.id)).toBe(1);
  });

  it("supprime les événements 30 jours après la fin de la session ; l'indice reste", async () => {
    await renseignerRgpd(); // événements 30 jours, résultats 365 jours
    const c = await contexte();
    const echue = await sessionDeTest(c, 31 * JOUR, { statut: "terminee" });
    const recente = await sessionDeTest(c, 29 * JOUR, { statut: "terminee" });
    const annulee = await sessionDeTest(c, 31 * JOUR, { statut: "annulee" });
    const enCours = await sessionDeTest(c, 400 * JOUR, { statut: "en_cours" });
    await db()
      .update(participation)
      .set({ indice: 12, indiceVersion: 1, indiceDetail: [] })
      .where(eq(participation.id, echue.participation.id));

    const bilan = await executerPurges();
    expect(bilan).toMatchObject({ conservationRenseignee: true, evenements: 2, sessions: 0, erreurs: [] });
    expect(await evenementsDe(echue.participation.id)).toBe(0);
    expect(await evenementsDe(annulee.participation.id)).toBe(0);
    expect(await evenementsDe(recente.participation.id)).toBe(1);
    expect(await evenementsDe(enCours.participation.id)).toBe(1);
    const [p] = await db().select().from(participation).where(eq(participation.id, echue.participation.id));
    expect(p?.indice).toBe(12);
  });

  it("supprime un groupe de sessions à l'échéance de son membre le plus récent", async () => {
    await renseignerRgpd();
    const c = await contexte();
    const terminee = await sessionDeTest(c, 366 * JOUR, { statut: "terminee" });
    const annulee = await sessionDeTest(c, 366 * JOUR, { statut: "annulee" });
    const enAttente = await sessionDeTest(c, 366 * JOUR, { statut: "attente" });
    const recente = await sessionDeTest(c, 364 * JOUR, { statut: "terminee" });
    const enCours = await sessionDeTest(c, 400 * JOUR, { statut: "en_cours" });
    const origineGardee = await sessionDeTest(c, 400 * JOUR, { statut: "terminee" });
    const rattrapageRecent = await sessionDeTest(c, 100 * JOUR, {
      statut: "terminee",
      type: "rattrapage",
      sessionOrigineId: origineGardee.session.id,
    });
    const origineEchue = await sessionDeTest(c, 400 * JOUR, { statut: "terminee" });
    const rattrapageEchu = await sessionDeTest(c, 370 * JOUR, {
      statut: "terminee",
      type: "rattrapage",
      sessionOrigineId: origineEchue.session.id,
    });

    const bilan = await executerPurges();
    expect(bilan.sessions).toBe(5);
    expect(bilan.erreurs).toEqual([]);
    for (const supprimee of [terminee, annulee, enAttente, origineEchue, rattrapageEchu]) {
      expect(await sessionExiste(supprimee.session.id)).toBe(false);
      const restantes = await db()
        .select({ id: participation.id })
        .from(participation)
        .where(eq(participation.sessionId, supprimee.session.id));
      expect(restantes).toEqual([]);
    }
    for (const gardee of [recente, enCours, origineGardee, rattrapageRecent]) {
      expect(await sessionExiste(gardee.session.id)).toBe(true);
    }
    // L'étudiant reste dans sa classe : seules ses participations échues sont parties.
    expect(
      await db().select({ id: etudiant.id }).from(etudiant).where(eq(etudiant.id, c.lea.id)),
    ).toHaveLength(1);
  });

  it("purge connexions, liens de réinitialisation, invitations closes, limiteur et journal ancien", async () => {
    const u = await creerUtilisateur();
    const jeton = () => sha256Hex(randomUUID());
    const instant = (ms: number) => new Date(DEBUT + ms);
    await db()
      .insert(sessionConnexion)
      .values([
        // expirée
        {
          utilisateurId: u.id,
          jetonHash: jeton(),
          creeLe: instant(-2 * JOUR),
          derniereActiviteLe: instant(-HEURE),
          expireLe: instant(-1000),
          doubleAuthValidee: true,
        },
        // inactive depuis 31 min, sans « Rester connecté »
        {
          utilisateurId: u.id,
          jetonHash: jeton(),
          creeLe: instant(-HEURE),
          derniereActiviteLe: instant(-31 * MINUTE),
          expireLe: instant(11 * HEURE),
          doubleAuthValidee: true,
        },
        // « Rester connecté » : l'inactivité ne compte pas
        {
          utilisateurId: u.id,
          jetonHash: jeton(),
          creeLe: instant(-3 * JOUR),
          derniereActiviteLe: instant(-2 * JOUR),
          expireLe: instant(20 * JOUR),
          doubleAuthValidee: true,
          resterConnecte: true,
        },
        // active
        {
          utilisateurId: u.id,
          jetonHash: jeton(),
          creeLe: instant(-HEURE),
          derniereActiviteLe: instant(-MINUTE),
          expireLe: instant(11 * HEURE),
          doubleAuthValidee: true,
        },
      ]);
    await db()
      .insert(jetonReinitialisation)
      .values([
        { utilisateurId: u.id, jetonHash: jeton(), creeLe: instant(-HEURE), expireLe: instant(-1000) },
        {
          utilisateurId: u.id,
          jetonHash: jeton(),
          creeLe: instant(-HEURE),
          expireLe: instant(HEURE),
          utiliseLe: instant(-MINUTE),
        },
        { utilisateurId: u.id, jetonHash: jeton(), creeLe: instant(-MINUTE), expireLe: instant(HEURE) },
      ]);
    await db()
      .insert(invitation)
      .values([
        {
          email: "utilisee.ancienne@exemple.fr",
          role: "enseignant",
          jetonHash: jeton(),
          creeLe: instant(-40 * JOUR),
          expireLe: instant(-33 * JOUR),
          utiliseeLe: instant(-31 * JOUR),
        },
        {
          email: "annulee.ancienne@exemple.fr",
          role: "enseignant",
          jetonHash: jeton(),
          creeLe: instant(-40 * JOUR),
          expireLe: instant(-33 * JOUR),
          annuleeLe: instant(-31 * JOUR),
        },
        {
          email: "utilisee.recente@exemple.fr",
          role: "enseignant",
          jetonHash: jeton(),
          creeLe: instant(-35 * JOUR),
          expireLe: instant(-28 * JOUR),
          utiliseeLe: instant(-29 * JOUR),
        },
        {
          email: "expiree.en.attente@exemple.fr",
          role: "enseignant",
          jetonHash: jeton(),
          creeLe: instant(-40 * JOUR),
          expireLe: instant(-33 * JOUR),
        },
      ]);
    await db()
      .insert(limiteur)
      .values([
        { cle: "test:ancienne", compteur: 3, fenetreDebut: instant(-25 * HEURE) },
        {
          cle: "test:bloquee",
          compteur: 9,
          fenetreDebut: instant(-25 * HEURE),
          bloqueJusquAu: instant(HEURE),
        },
        { cle: "test:recente", compteur: 1, fenetreDebut: instant(-MINUTE) },
      ]);
    await db()
      .insert(journal)
      .values([
        { acteurType: "systeme", action: "test.ancien", details: {}, creeLe: instant(-400 * JOUR) },
        { acteurType: "systeme", action: "test.recent", details: {}, creeLe: instant(-330 * JOUR) },
      ]);

    const bilan = await executerPurges();
    expect(bilan).toMatchObject({
      connexions: 2,
      jetons: 2,
      invitations: 2,
      limiteur: 1,
      journal: 1,
      erreurs: [],
    });
    expect(
      (await db().select({ email: invitation.email }).from(invitation)).map((i) => i.email).sort(),
    ).toEqual(["expiree.en.attente@exemple.fr", "utilisee.recente@exemple.fr"]);
    expect((await db().select({ cle: limiteur.cle }).from(limiteur)).map((l) => l.cle).sort()).toEqual([
      "test:bloquee",
      "test:recente",
    ]);

    const seconde = await executerPurges();
    expect(seconde).toMatchObject({
      connexions: 0,
      jetons: 0,
      invitations: 0,
      limiteur: 0,
      journal: 0,
      erreurs: [],
    });
  });

  it("journalise le bilan après la purge du journal", async () => {
    const bilan = await executerPurges();
    const entrees = await db().select().from(journal).where(eq(journal.action, "purges.executer"));
    expect(entrees).toHaveLength(1);
    expect(entrees[0]).toMatchObject({ acteurType: "systeme", acteurId: null });
    expect(entrees[0]?.details).toMatchObject({ erreurs: bilan.erreurs, connexions: bilan.connexions });
  });

  it("isole une étape en échec : les suivantes tournent, l'erreur est nommée", async () => {
    const fichier = path.join(os.tmpdir(), `carreau-pas-un-dossier-${randomUUID()}`);
    await writeFile(fichier, "x");
    const precedent = process.env.IMAGES_DIR;
    const espion = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      process.env.IMAGES_DIR = fichier;
      reinitialiserEnvPourLesTests();
      const bilan = await executerPurges();
      expect(bilan.erreurs).toEqual(["images"]);
      expect(bilan.images).toBeNull();
      expect(bilan).toMatchObject({ connexions: 0, jetons: 0, invitations: 0, limiteur: 0, journal: 0 });
      expect(espion.mock.calls.some(([message]) => String(message).startsWith("[purges:images]"))).toBe(true);
    } finally {
      process.env.IMAGES_DIR = precedent;
      reinitialiserEnvPourLesTests();
      espion.mockRestore();
    }
  });
});
