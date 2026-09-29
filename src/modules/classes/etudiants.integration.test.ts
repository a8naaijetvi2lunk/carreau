import { and, count, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { etudiant, journal } from "@/db/schema";
import type { ActeurUtilisateur, Role } from "@/lib/acteur";
import { definirHorlogePourLesTests, horlogeFixe, maintenant } from "@/lib/horloge";
import {
  ajouterEtudiant,
  changerTiersTemps,
  MAX_ETUDIANTS_PAR_CLASSE,
  MESSAGE_CLASSE_PLEINE,
  MESSAGE_ETUDIANT_PARTICIPANT,
  modifierEtudiant,
  retirerEtudiant,
} from "@/modules/classes";
import { creerClasseTest, creerEtudiantTest } from "@/test/classes";
import { acteurDe, creerUtilisateur } from "@/test/comptes";
import { creerParticipationTest, preparerSession } from "@/test/sessions";

const DEBUT = Date.parse("2026-09-29T08:00:00.000Z");

beforeEach(() => definirHorlogePourLesTests(horlogeFixe(DEBUT)));
afterEach(() => definirHorlogePourLesTests());

async function acteur(role: Role = "enseignant"): Promise<ActeurUtilisateur> {
  return acteurDe(await creerUtilisateur({ role }));
}

async function classeDe(a: ActeurUtilisateur) {
  return creerClasseTest(a.id);
}

async function journalDe(acteurId: string, action: string) {
  return db()
    .select()
    .from(journal)
    .where(and(eq(journal.acteurId, acteurId), eq(journal.action, action)));
}

async function effectif(classeId: string): Promise<number> {
  const [ligne] = await db().select({ total: count() }).from(etudiant).where(eq(etudiant.classeId, classeId));
  return ligne?.total ?? 0;
}

describe("ajouterEtudiant", () => {
  it("ajoute un étudiant nettoyé, avec ses noms normalisés, et journalise sans nom", async () => {
    const a = await acteur();
    const c = await classeDe(a);
    const ajoute = await ajouterEtudiant(a, {
      classeId: c.id,
      nom: "  DUPRÉ ",
      prenom: "Jean-Pierre",
      tiersTemps: true,
    });
    expect(ajoute).toMatchObject({ nom: "DUPRÉ", prenom: "Jean-Pierre", tiersTemps: true });
    const [ligne] = await db().select().from(etudiant).where(eq(etudiant.id, ajoute.id));
    expect(ligne).toMatchObject({ nomNormalise: "dupre", prenomNormalise: "jean pierre" });
    const [entree] = await journalDe(a.id, "etudiants.ajouter");
    expect(entree).toMatchObject({ cible: `etudiant:${ajoute.id}`, details: { classeId: c.id } });
    expect(JSON.stringify(entree)).not.toMatch(/DUPR|Jean/);
  });

  it.each([
    [
      { nom: "Dupont", prenom: "Léa" },
      { nom: "DUPONT", prenom: "lea" },
    ],
    [
      { nom: "Martin-Durand", prenom: "Inès" },
      { nom: "martin durand", prenom: "Ines" },
    ],
    [
      { nom: "D'Arc", prenom: "Jeanne" },
      { nom: "d’arc", prenom: "JEANNE" },
    ],
  ])("refuse l'homonyme parfait de %o : %o", async (premier, second) => {
    const a = await acteur();
    const c = await classeDe(a);
    await ajouterEtudiant(a, { classeId: c.id, ...premier, tiersTemps: false });
    await expect(ajouterEtudiant(a, { classeId: c.id, ...second, tiersTemps: false })).rejects.toMatchObject({
      code: "VALIDATION",
      message: `${second.prenom} ${second.nom} est déjà dans la classe : distingue-les par une initiale ou un second prénom.`,
    });
  });

  it.each([
    ["nom", "", "Le nom est obligatoire."],
    ["prenom", "  ", "Le prénom est obligatoire."],
    ["nom", "x".repeat(101), "Le nom dépasse 100 caractères."],
    ["prenom", "Lé\u0000a", "Le prénom contient des caractères non autorisés."],
    ["nom", " - ", "Le nom doit contenir au moins une lettre ou un chiffre."],
  ])("refuse %s = « %s »", async (champ, valeur, message) => {
    const a = await acteur();
    const c = await classeDe(a);
    await expect(
      ajouterEtudiant(a, {
        classeId: c.id,
        nom: "Dupont",
        prenom: "Léa",
        tiersTemps: false,
        [champ]: valeur,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION", details: [{ chemin: champ, message }] });
  });

  it(`refuse un ${MAX_ETUDIANTS_PAR_CLASSE + 1}e étudiant`, async () => {
    const a = await acteur();
    const c = await classeDe(a);
    await db()
      .insert(etudiant)
      .values(
        Array.from({ length: MAX_ETUDIANTS_PAR_CLASSE }, (_, i) => ({
          classeId: c.id,
          nom: `N${i}`,
          prenom: "P",
          nomNormalise: `n${i}`,
          prenomNormalise: "p",
          creeLe: maintenant(),
        })),
      );
    await expect(
      ajouterEtudiant(a, { classeId: c.id, nom: "Dupont", prenom: "Léa", tiersTemps: false }),
    ).rejects.toMatchObject({ code: "ETAT", message: MESSAGE_CLASSE_PLEINE });
  });

  it("deux ajouts simultanés du même nom : un seul passe, l'autre est refusé proprement", async () => {
    const a = await acteur();
    const c = await classeDe(a);
    const saisie = { classeId: c.id, nom: "Dupont", prenom: "Léa", tiersTemps: false };
    const resultats = await Promise.allSettled([ajouterEtudiant(a, saisie), ajouterEtudiant(a, saisie)]);
    expect(resultats.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultats.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "VALIDATION" } });
    expect(await effectif(c.id)).toBe(1);
  });

  it("deux ajouts simultanés dans une classe à une place : un seul passe", async () => {
    const a = await acteur();
    const c = await classeDe(a);
    await db()
      .insert(etudiant)
      .values(
        Array.from({ length: MAX_ETUDIANTS_PAR_CLASSE - 1 }, (_, i) => ({
          classeId: c.id,
          nom: `N${i}`,
          prenom: "P",
          nomNormalise: `n${i}`,
          prenomNormalise: "p",
          creeLe: maintenant(),
        })),
      );
    const resultats = await Promise.allSettled([
      ajouterEtudiant(a, { classeId: c.id, nom: "Dupont", prenom: "Léa", tiersTemps: false }),
      ajouterEtudiant(a, { classeId: c.id, nom: "Martin", prenom: "Inès", tiersTemps: false }),
    ]);
    expect(resultats.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultats.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "ETAT" } });
    expect(await effectif(c.id)).toBe(MAX_ETUDIANTS_PAR_CLASSE);
  });
});

describe("modifierEtudiant, changerTiersTemps, retirerEtudiant", () => {
  it("modifie nom et prénom ; changer la seule casse de son propre nom est permis", async () => {
    const a = await acteur();
    const c = await classeDe(a);
    const e = await creerEtudiantTest(c.id, { nom: "dupont", prenom: "lea" });
    await expect(
      modifierEtudiant(a, { etudiantId: e.id, nom: "DUPONT", prenom: "Léa" }),
    ).resolves.toMatchObject({
      nom: "DUPONT",
      prenom: "Léa",
    });
    expect(await journalDe(a.id, "etudiants.modifier")).toHaveLength(1);
  });

  it("refuse de donner le nom d'un autre étudiant de la classe", async () => {
    const a = await acteur();
    const c = await classeDe(a);
    await creerEtudiantTest(c.id, { nom: "Martin", prenom: "Inès" });
    const e = await creerEtudiantTest(c.id, { nom: "Dupont", prenom: "Léa" });
    await expect(
      modifierEtudiant(a, { etudiantId: e.id, nom: "MARTIN", prenom: "ines" }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("change le tiers-temps, sans rien journaliser si la valeur ne change pas", async () => {
    const a = await acteur();
    const c = await classeDe(a);
    const e = await creerEtudiantTest(c.id);
    await expect(changerTiersTemps(a, { etudiantId: e.id, tiersTemps: false })).resolves.toMatchObject({
      tiersTemps: false,
    });
    expect(await journalDe(a.id, "etudiants.changer_tiers_temps")).toEqual([]);
    await expect(changerTiersTemps(a, { etudiantId: e.id, tiersTemps: true })).resolves.toMatchObject({
      tiersTemps: true,
    });
    const [entree] = await journalDe(a.id, "etudiants.changer_tiers_temps");
    expect(entree).toMatchObject({ cible: `etudiant:${e.id}`, details: { tiersTemps: true } });
  });

  it("retire un étudiant, puis le déclare introuvable", async () => {
    const a = await acteur();
    const c = await classeDe(a);
    const e = await creerEtudiantTest(c.id, { nom: "Dupont", prenom: "Léa" });
    await expect(retirerEtudiant(a, { etudiantId: e.id })).resolves.toMatchObject({
      nom: "Dupont",
      prenom: "Léa",
    });
    expect(await effectif(c.id)).toBe(0);
    await expect(retirerEtudiant(a, { etudiantId: e.id })).rejects.toMatchObject({
      code: "INTROUVABLE",
      message: "Étudiant introuvable.",
    });
  });

  it("refuse de retirer un étudiant qui a rejoint une session d'examen", async () => {
    const { acteur, session, etudiants } = await preparerSession();
    const [lea, sacha] = etudiants;
    if (!lea || !sacha) throw new Error("étudiants absents");
    await creerParticipationTest(session.id, lea.id);
    await expect(retirerEtudiant(acteur, { etudiantId: lea.id })).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGE_ETUDIANT_PARTICIPANT,
    });
    await expect(retirerEtudiant(acteur, { etudiantId: sacha.id })).resolves.toMatchObject({
      prenom: "Sacha",
    });
  });
});

describe("matrice des refus : l'étudiant ou la classe d'un autre compte", () => {
  const services = {
    ajouterEtudiant: (x: ActeurUtilisateur, ids: { classeId: string; etudiantId: string }) =>
      ajouterEtudiant(x, { classeId: ids.classeId, nom: "Intrus", prenom: "Ivan", tiersTemps: false }),
    modifierEtudiant: (x: ActeurUtilisateur, ids: { classeId: string; etudiantId: string }) =>
      modifierEtudiant(x, { etudiantId: ids.etudiantId, nom: "Intrus", prenom: "Ivan" }),
    changerTiersTemps: (x: ActeurUtilisateur, ids: { classeId: string; etudiantId: string }) =>
      changerTiersTemps(x, { etudiantId: ids.etudiantId, tiersTemps: true }),
    retirerEtudiant: (x: ActeurUtilisateur, ids: { classeId: string; etudiantId: string }) =>
      retirerEtudiant(x, { etudiantId: ids.etudiantId }),
  };

  const cas = (["enseignant", "admin", "super_admin"] as const).flatMap((role) =>
    Object.keys(services).map((service) => [role, service] as const),
  );

  it.each(cas)("un compte %s → %s : introuvable, refus journalisé, rien ne change", async (role, service) => {
    const proprietaire = await acteur("enseignant");
    const c = await classeDe(proprietaire);
    const e = await creerEtudiantTest(c.id, { nom: "Dupont", prenom: "Léa" });
    const intrus = await acteur(role);
    await expect(
      services[service as keyof typeof services](intrus, { classeId: c.id, etudiantId: e.id }),
    ).rejects.toMatchObject({ code: "INTROUVABLE" });
    const [entree] = await journalDe(intrus.id, "acces.refus");
    expect(entree?.details).toMatchObject({ role, motif: "ressource_autrui" });
    const [intact] = await db().select().from(etudiant).where(eq(etudiant.classeId, c.id));
    expect(intact).toMatchObject({ nom: "Dupont", prenom: "Léa", tiersTemps: false });
    expect(await effectif(c.id)).toBe(1);
  });

  it("un identifiant d'étudiant mal formé répond introuvable, sans journal", async () => {
    const a = await acteur();
    await expect(retirerEtudiant(a, { etudiantId: "12" })).rejects.toMatchObject({
      code: "INTROUVABLE",
      message: "Étudiant introuvable.",
    });
    expect(await journalDe(a.id, "acces.refus")).toEqual([]);
  });
});
