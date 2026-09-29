import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { etudiant, journal } from "@/db/schema";
import type { ActeurUtilisateur, Role } from "@/lib/acteur";
import { definirHorlogePourLesTests, horlogeFixe, maintenant } from "@/lib/horloge";
import { analyserImport, importerEtudiants, MAX_ETUDIANTS_PAR_CLASSE } from "@/modules/classes";
import { classeurXlsx, creerClasseTest, creerEtudiantTest } from "@/test/classes";
import { acteurDe, creerUtilisateur } from "@/test/comptes";

const DEBUT = Date.parse("2026-09-29T08:00:00.000Z");

beforeEach(() => definirHorlogePourLesTests(horlogeFixe(DEBUT)));
afterEach(() => definirHorlogePourLesTests());

async function acteur(role: Role = "enseignant"): Promise<ActeurUtilisateur> {
  return acteurDe(await creerUtilisateur({ role }));
}

/**
 * Liste de 32 lignes de données : 30 étudiants valides (les deux premiers en tiers-temps), une
 * ligne sans prénom (ligne 13 du fichier) et un doublon de la ligne 6 (ligne 33).
 */
function listeCsv(): string {
  const lignes = ["Nom;Prénom;Tiers-temps"];
  for (let i = 1; i <= 30; i += 1)
    lignes.push(`NOM${String(i).padStart(2, "0")};Prénom${i};${i <= 2 ? "oui" : ""}`);
  lignes.splice(12, 0, "SANSPRENOM;;non");
  lignes.push("nom05;PRÉNOM5;oui");
  return lignes.join("\r\n");
}

const texte = (contenu: string) => ({ type: "texte" as const, texte: contenu });

async function effectif(classeId: string) {
  return (await db().select().from(etudiant).where(eq(etudiant.classeId, classeId))).length;
}

async function journalDe(acteurId: string, action: string) {
  return db()
    .select()
    .from(journal)
    .where(and(eq(journal.acteurId, acteurId), eq(journal.action, action)));
}

/** Lignes renvoyées par le formulaire de confirmation : celles de l'aperçu, sans numéro ni statut. */
function lignesConfirmees(apercu: { lignes: { nom: string; prenom: string; tiersTemps: boolean | null }[] }) {
  return apercu.lignes.map(({ nom, prenom, tiersTemps }) => ({ nom, prenom, tiersTemps }));
}

describe("analyserImport", () => {
  it("donne l'aperçu de 30 étudiants et explique les deux rejets, sans rien écrire", async () => {
    const a = await acteur();
    const c = await creerClasseTest(a.id);
    const apercu = await analyserImport(a, { classeId: c.id, source: texte(listeCsv()) });
    expect(apercu).toMatchObject({ ajouts: 30, misesAJour: 0, dejaPresents: 0, colonneTiersTemps: true });
    expect(apercu.lignes).toHaveLength(30);
    expect(apercu.lignes[0]).toEqual({
      numero: 2,
      nom: "NOM01",
      prenom: "Prénom1",
      tiersTemps: true,
      statut: "nouveau",
    });
    expect(apercu.rejets).toEqual([
      { numero: 13, motif: "Le prénom est obligatoire." },
      { numero: 33, motif: "Même nom et même prénom qu'à la ligne 6." },
    ]);
    expect(await effectif(c.id)).toBe(0);
  });

  it("compare à la classe : nouveau, tiers-temps modifié, déjà présent", async () => {
    const a = await acteur();
    const c = await creerClasseTest(a.id);
    await creerEtudiantTest(c.id, { nom: "Dupont", prenom: "Léa", tiersTemps: false });
    await creerEtudiantTest(c.id, { nom: "Martin", prenom: "Inès", tiersTemps: true });
    const avecColonne = await analyserImport(a, {
      classeId: c.id,
      source: texte("Nom;Prénom;Tiers-temps\nDUPONT;lea;oui\nMartin;Inès;oui\nGirard;Enzo;"),
    });
    expect(avecColonne.lignes.map((l) => l.statut)).toEqual([
      "tiers_temps_modifie",
      "deja_present",
      "nouveau",
    ]);
    expect(avecColonne).toMatchObject({ ajouts: 1, misesAJour: 1, dejaPresents: 1 });
    const sansColonne = await analyserImport(a, { classeId: c.id, source: texte("Nom;Prénom\nMartin;Inès") });
    expect(sansColonne.lignes).toEqual([
      { numero: 2, nom: "Martin", prenom: "Inès", tiersTemps: null, statut: "deja_present" },
    ]);
  });

  it("lit un classeur XLSX comme un CSV", async () => {
    const a = await acteur();
    const c = await creerClasseTest(a.id);
    const xlsx = await classeurXlsx([
      ["Nom", "Prénom", "Tiers-temps"],
      ["Dupont", "Léa", true],
      ["Martin", "", false],
    ]);
    const apercu = await analyserImport(a, {
      classeId: c.id,
      source: { type: "fichier", nom: "td2.xlsx", octets: xlsx },
    });
    expect(apercu.lignes).toEqual([
      { numero: 2, nom: "Dupont", prenom: "Léa", tiersTemps: true, statut: "nouveau" },
    ]);
    expect(apercu.rejets).toEqual([{ numero: 3, motif: "Le prénom est obligatoire." }]);
  });

  it("refuse une liste qui ferait dépasser 500 étudiants", async () => {
    const a = await acteur();
    const c = await creerClasseTest(a.id);
    await db()
      .insert(etudiant)
      .values(
        Array.from({ length: MAX_ETUDIANTS_PAR_CLASSE - 10 }, (_, i) => ({
          classeId: c.id,
          nom: `N${i}`,
          prenom: "P",
          nomNormalise: `n${i}`,
          prenomNormalise: "p",
          creeLe: maintenant(),
        })),
      );
    const liste = ["Nom;Prénom", ...Array.from({ length: 11 }, (_, i) => `Nouveau${i};P`)].join("\n");
    await expect(analyserImport(a, { classeId: c.id, source: texte(liste) })).rejects.toMatchObject({
      code: "ETAT",
      message: "La classe dépasserait 500 étudiants (490 aujourd'hui, 11 à ajouter).",
    });
  });
});

describe("importerEtudiants", () => {
  it("enregistre les lignes confirmées, journalise le bilan sans nom, puis ne double rien", async () => {
    const a = await acteur();
    const c = await creerClasseTest(a.id);
    const apercu = await analyserImport(a, { classeId: c.id, source: texte(listeCsv()) });
    await expect(importerEtudiants(a, { classeId: c.id, lignes: lignesConfirmees(apercu) })).resolves.toEqual(
      {
        ajoutes: 30,
        misAJour: 0,
        inchanges: 0,
      },
    );
    expect(await effectif(c.id)).toBe(30);
    const tiers = await db()
      .select()
      .from(etudiant)
      .where(and(eq(etudiant.classeId, c.id), eq(etudiant.tiersTemps, true)));
    expect(tiers.map((e) => e.nom).sort()).toEqual(["NOM01", "NOM02"]);
    const [entree] = await journalDe(a.id, "classes.importer");
    expect(entree).toMatchObject({
      cible: `classe:${c.id}`,
      details: { ajoutes: 30, misAJour: 0, inchanges: 0 },
    });
    expect(JSON.stringify(entree)).not.toMatch(/NOM|Prénom/);
    await expect(importerEtudiants(a, { classeId: c.id, lignes: lignesConfirmees(apercu) })).resolves.toEqual(
      {
        ajoutes: 0,
        misAJour: 0,
        inchanges: 30,
      },
    );
  });

  it("met à jour le tiers-temps seulement quand la colonne existe, et conserve les absents", async () => {
    const a = await acteur();
    const c = await creerClasseTest(a.id);
    const lea = await creerEtudiantTest(c.id, { nom: "Dupont", prenom: "Léa", tiersTemps: true });
    const ines = await creerEtudiantTest(c.id, { nom: "Martin", prenom: "Inès", tiersTemps: false });
    await creerEtudiantTest(c.id, { nom: "Absent", prenom: "Paul" });
    const bilan = await importerEtudiants(a, {
      classeId: c.id,
      lignes: [
        { nom: "DUPONT", prenom: "lea", tiersTemps: false },
        { nom: "Martin", prenom: "Inès", tiersTemps: null },
        { nom: "Girard", prenom: "Enzo", tiersTemps: null },
      ],
    });
    expect(bilan).toEqual({ ajoutes: 1, misAJour: 1, inchanges: 1 });
    const parId = new Map(
      (await db().select().from(etudiant).where(eq(etudiant.classeId, c.id))).map((e) => [e.id, e]),
    );
    expect(parId.get(lea.id)?.tiersTemps).toBe(false);
    expect(parId.get(ines.id)?.tiersTemps).toBe(false);
    expect(parId.size).toBe(4);
  });

  it.each([
    ["une liste absente (JSON invalide)", undefined],
    ["une liste vide", []],
    ["une ligne sans prénom", [{ nom: "Dupont", prenom: " ", tiersTemps: null }]],
    ["une ligne avec un champ inconnu", [{ nom: "Dupont", prenom: "Léa", tiersTemps: null, role: "admin" }]],
    [
      "plus de 500 lignes",
      Array.from({ length: 501 }, (_, i) => ({ nom: `N${i}`, prenom: "P", tiersTemps: null })),
    ],
  ])("revalide tout et refuse %s", async (_cas, lignes) => {
    const a = await acteur();
    const c = await creerClasseTest(a.id);
    await expect(importerEtudiants(a, { classeId: c.id, lignes })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(await effectif(c.id)).toBe(0);
  });

  it("deux imports simultanés de la même liste n'ajoutent chaque étudiant qu'une fois", async () => {
    const a = await acteur();
    const c = await creerClasseTest(a.id);
    const apercu = await analyserImport(a, { classeId: c.id, source: texte(listeCsv()) });
    const bilans = await Promise.all([
      importerEtudiants(a, { classeId: c.id, lignes: lignesConfirmees(apercu) }),
      importerEtudiants(a, { classeId: c.id, lignes: lignesConfirmees(apercu) }),
    ]);
    expect(bilans.map((b) => b.ajoutes).sort((x, y) => x - y)).toEqual([0, 30]);
    expect(await effectif(c.id)).toBe(30);
  });
});

describe("matrice des refus : importer dans la classe d'un autre compte", () => {
  it.each(["enseignant", "admin", "super_admin"] as const)(
    "un compte %s : introuvable, refus journalisé, rien d'écrit",
    async (role) => {
      const proprietaire = await acteur();
      const c = await creerClasseTest(proprietaire.id);
      const intrus = await acteur(role);
      await expect(
        analyserImport(intrus, { classeId: c.id, source: texte("Nom;Prénom\nDupont;Léa") }),
      ).rejects.toMatchObject({
        code: "INTROUVABLE",
        message: "Classe introuvable.",
      });
      await expect(
        importerEtudiants(intrus, {
          classeId: c.id,
          lignes: [{ nom: "Dupont", prenom: "Léa", tiersTemps: null }],
        }),
      ).rejects.toMatchObject({ code: "INTROUVABLE" });
      expect(await journalDe(intrus.id, "acces.refus")).toHaveLength(2);
      expect(await effectif(c.id)).toBe(0);
    },
  );
});
