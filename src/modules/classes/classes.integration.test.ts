import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { classe, journal } from "@/db/schema";
import type { ActeurUtilisateur, Role } from "@/lib/acteur";
import { definirHorlogePourLesTests, horlogeFixe, maintenant } from "@/lib/horloge";
import {
  archiverClasse,
  creerClasse,
  lireClasse,
  listerClasses,
  MAX_CLASSES_PAR_COMPTE,
  MESSAGE_LIMITE_CLASSES,
  renommerClasse,
  restaurerClasse,
} from "@/modules/classes";
import { creerClasseTest, creerEtudiantTest } from "@/test/classes";
import { acteurDe, creerUtilisateur } from "@/test/comptes";

const DEBUT = Date.parse("2026-09-29T08:00:00.000Z");

beforeEach(() => definirHorlogePourLesTests(horlogeFixe(DEBUT)));
afterEach(() => definirHorlogePourLesTests());

async function acteur(role: Role = "enseignant"): Promise<ActeurUtilisateur> {
  return acteurDe(await creerUtilisateur({ role }));
}

async function journalDe(acteurId: string, action: string) {
  return db()
    .select()
    .from(journal)
    .where(and(eq(journal.acteurId, acteurId), eq(journal.action, action)));
}

describe("creerClasse", () => {
  it("crée la classe de l'acteur, nom nettoyé, et journalise sans le nom", async () => {
    const a = await acteur();
    const { id } = await creerClasse(a, { nom: "  Groupe   TD2 " });
    const [creee] = await db().select().from(classe).where(eq(classe.id, id));
    expect(creee).toMatchObject({ enseignantId: a.id, nom: "Groupe TD2", archivee: false });
    const [entree] = await journalDe(a.id, "classes.creer");
    expect(entree).toMatchObject({ cible: `classe:${id}`, details: {} });
  });

  it.each(["admin", "super_admin"] as const)("un compte %s a aussi ses classes", async (role) => {
    const a = await acteur(role);
    await expect(creerClasse(a, { nom: "TD1" })).resolves.toHaveProperty("id");
  });

  it.each([
    ["", "Le nom de la classe est obligatoire."],
    ["   ", "Le nom de la classe est obligatoire."],
    ["x".repeat(61), "Le nom de la classe dépasse 60 caractères."],
    ["TD\u00072", "Le nom de la classe contient des caractères non autorisés."],
  ])("refuse le nom « %s »", async (nom, message) => {
    const a = await acteur();
    await expect(creerClasse(a, { nom })).rejects.toMatchObject({
      code: "VALIDATION",
      details: [{ chemin: "nom", message }],
    });
  });

  it("refuse un nom déjà pris par le même compte, à la casse près", async () => {
    const a = await acteur();
    await creerClasse(a, { nom: "TD2" });
    await expect(creerClasse(a, { nom: "td2" })).rejects.toMatchObject({
      code: "VALIDATION",
      details: [{ chemin: "nom", message: "Tu as déjà une classe nommée « td2 »." }],
    });
  });

  it("accepte un nom pris par un autre compte", async () => {
    const a = await acteur();
    const b = await acteur();
    await creerClasse(a, { nom: "TD2" });
    await expect(creerClasse(b, { nom: "TD2" })).resolves.toHaveProperty("id");
  });

  it(`refuse une ${MAX_CLASSES_PAR_COMPTE + 1}e classe`, async () => {
    const a = await acteur();
    await db()
      .insert(classe)
      .values(
        Array.from({ length: MAX_CLASSES_PAR_COMPTE }, (_, i) => ({
          enseignantId: a.id,
          nom: `C${i}`,
          creeLe: maintenant(),
        })),
      );
    await expect(creerClasse(a, { nom: "Une de trop" })).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGE_LIMITE_CLASSES,
    });
  });

  it("deux créations simultanées à la limite : une seule réussit", async () => {
    const a = await acteur();
    await db()
      .insert(classe)
      .values(
        Array.from({ length: MAX_CLASSES_PAR_COMPTE - 1 }, (_, i) => ({
          enseignantId: a.id,
          nom: `C${i}`,
          creeLe: maintenant(),
        })),
      );
    const resultats = await Promise.allSettled([
      creerClasse(a, { nom: "Concurrente A" }),
      creerClasse(a, { nom: "Concurrente B" }),
    ]);
    expect(resultats.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejet = resultats.find((r) => r.status === "rejected");
    expect(rejet?.status === "rejected" ? rejet.reason : null).toMatchObject({
      code: "ETAT",
      message: MESSAGE_LIMITE_CLASSES,
    });
    const lignes = await db().select({ id: classe.id }).from(classe).where(eq(classe.enseignantId, a.id));
    expect(lignes).toHaveLength(MAX_CLASSES_PAR_COMPTE);
  });

  it("refuse une saisie qui porte un champ inconnu", async () => {
    const a = await acteur();
    await expect(creerClasse(a, { nom: "TD1", enseignantId: a.id } as { nom: string })).rejects.toMatchObject(
      {
        code: "VALIDATION",
      },
    );
  });
});

describe("listerClasses et lireClasse", () => {
  it("liste les seules classes de l'acteur, en tri naturel, avec effectif et tiers-temps", async () => {
    const a = await acteur();
    const autre = await acteur();
    const td10 = await creerClasseTest(a.id, { nom: "TD10" });
    const td2 = await creerClasseTest(a.id, { nom: "td2", archivee: true });
    await creerClasseTest(autre.id, { nom: "TD1" });
    await creerEtudiantTest(td10.id, { tiersTemps: true });
    await creerEtudiantTest(td10.id);
    const classes = await listerClasses(a);
    expect(classes).toEqual([
      { id: td2.id, nom: "td2", archivee: true, effectif: 0, effectifTiersTemps: 0 },
      { id: td10.id, nom: "TD10", archivee: false, effectif: 2, effectifTiersTemps: 1 },
    ]);
  });

  it("lit une classe et ses étudiants triés par nom puis prénom", async () => {
    const a = await acteur();
    const c = await creerClasseTest(a.id, { nom: "TD3" });
    await creerEtudiantTest(c.id, { nom: "Martin", prenom: "Inès" });
    await creerEtudiantTest(c.id, { nom: "DUPONT", prenom: "Léa", tiersTemps: true });
    await creerEtudiantTest(c.id, { nom: "Dupont", prenom: "Alice" });
    const lue = await lireClasse(a, { classeId: c.id });
    expect(lue).toMatchObject({ id: c.id, nom: "TD3", archivee: false });
    expect(lue.etudiants.map((e) => `${e.prenom} ${e.nom}`)).toEqual([
      "Alice Dupont",
      "Léa DUPONT",
      "Inès Martin",
    ]);
    expect(lue.etudiants[1]?.tiersTemps).toBe(true);
  });

  it("un identifiant mal formé ou inexistant répond introuvable, sans journal", async () => {
    const a = await acteur();
    await expect(lireClasse(a, { classeId: "pas-un-uuid" })).rejects.toMatchObject({
      code: "INTROUVABLE",
      message: "Classe introuvable.",
    });
    await expect(lireClasse(a, { classeId: "00000000-0000-4000-8000-000000000001" })).rejects.toMatchObject({
      code: "INTROUVABLE",
    });
    expect(await journalDe(a.id, "acces.refus")).toEqual([]);
  });
});

describe("renommerClasse, archiverClasse, restaurerClasse", () => {
  it("renomme et journalise ; un nom inchangé ne journalise rien", async () => {
    const a = await acteur();
    const c = await creerClasseTest(a.id, { nom: "TD1" });
    await renommerClasse(a, { classeId: c.id, nom: "TD1" });
    expect(await journalDe(a.id, "classes.renommer")).toEqual([]);
    await renommerClasse(a, { classeId: c.id, nom: " Groupe  A " });
    const [lue] = await db().select().from(classe).where(eq(classe.id, c.id));
    expect(lue?.nom).toBe("Groupe A");
    expect(await journalDe(a.id, "classes.renommer")).toHaveLength(1);
  });

  it("accepte de changer la seule casse du nom, refuse le nom d'une autre classe", async () => {
    const a = await acteur();
    const c = await creerClasseTest(a.id, { nom: "td1" });
    await creerClasseTest(a.id, { nom: "TD2" });
    await expect(renommerClasse(a, { classeId: c.id, nom: "TD1" })).resolves.toBeUndefined();
    await expect(renommerClasse(a, { classeId: c.id, nom: "Td2" })).rejects.toMatchObject({
      code: "VALIDATION",
      details: [{ chemin: "nom", message: "Tu as déjà une classe nommée « Td2 »." }],
    });
  });

  it("archive puis restaure, et refuse de le refaire", async () => {
    const a = await acteur();
    const c = await creerClasseTest(a.id);
    await archiverClasse(a, { classeId: c.id });
    await expect(archiverClasse(a, { classeId: c.id })).rejects.toMatchObject({
      code: "ETAT",
      message: "Cette classe est déjà archivée.",
    });
    await restaurerClasse(a, { classeId: c.id });
    await expect(restaurerClasse(a, { classeId: c.id })).rejects.toMatchObject({
      code: "ETAT",
      message: "Cette classe n'est pas archivée.",
    });
    expect(await journalDe(a.id, "classes.archiver")).toHaveLength(1);
    expect(await journalDe(a.id, "classes.restaurer")).toHaveLength(1);
  });
});

describe("matrice des refus : la classe d'un autre compte", () => {
  const services = {
    lireClasse: (x: ActeurUtilisateur, classeId: string) => lireClasse(x, { classeId }),
    renommerClasse: (x: ActeurUtilisateur, classeId: string) =>
      renommerClasse(x, { classeId, nom: "Piratée" }),
    archiverClasse: (x: ActeurUtilisateur, classeId: string) => archiverClasse(x, { classeId }),
    restaurerClasse: (x: ActeurUtilisateur, classeId: string) => restaurerClasse(x, { classeId }),
  };

  const cas = (["enseignant", "admin", "super_admin"] as const).flatMap((role) =>
    Object.keys(services).map((service) => [role, service] as const),
  );

  it.each(cas)("un compte %s → %s : introuvable et refus journalisé", async (role, service) => {
    const proprietaire = await acteur("enseignant");
    const c = await creerClasseTest(proprietaire.id, { nom: "TD1", archivee: service === "restaurerClasse" });
    const intrus = await acteur(role);
    await expect(services[service as keyof typeof services](intrus, c.id)).rejects.toMatchObject({
      code: "INTROUVABLE",
      message: "Classe introuvable.",
    });
    const [entree] = await journalDe(intrus.id, "acces.refus");
    expect(entree?.details).toMatchObject({ role, motif: "ressource_autrui" });
    const [intacte] = await db().select().from(classe).where(eq(classe.id, c.id));
    expect(intacte).toMatchObject({ nom: "TD1", archivee: service === "restaurerClasse" });
  });
});
