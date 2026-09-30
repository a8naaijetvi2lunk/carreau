import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { jetonMcp, journal } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { sha256Hex } from "@/lib/jetons";
import { FORMAT_JETON_MCP, MESSAGE_LIMITE_JETONS } from "@/lib/regles-mcp";
import { acteurDe, creerUtilisateur } from "@/test/comptes";
import { acteurMcpDe, creerJetonMcpTest } from "@/test/mcp";
import { creerJetonMcp, listerJetonsMcp, MESSAGE_JETONS_DEPUIS_CARREAU, revoquerJetonMcp } from "./jetons";

const DEBUT = Date.parse("2026-09-30T08:00:00.000Z");
const horloge = horlogeFixe(DEBUT);

beforeEach(() => {
  horloge.fixer(DEBUT);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

async function compte() {
  const u = await creerUtilisateur();
  return { u, acteur: acteurDe(u) };
}

async function journalDe(cible: string) {
  return db().select().from(journal).where(eq(journal.cible, cible));
}

async function ligne(id: string) {
  const [lue] = await db().select().from(jetonMcp).where(eq(jetonMcp.id, id));
  return lue;
}

describe("creerJetonMcp", () => {
  it("crée un jeton carreau_ montré une seule fois, stocké haché, journalisé sans son nom", async () => {
    const { acteur } = await compte();
    const cree = await creerJetonMcp(acteur, { nom: "  Portable   perso ", portee: "ecriture" });
    expect(cree.nom).toBe("Portable perso");
    expect(cree.portee).toBe("ecriture");
    expect(FORMAT_JETON_MCP.test(cree.jeton)).toBe(true);
    expect(await ligne(cree.id)).toMatchObject({
      enseignantId: acteur.id,
      nom: "Portable perso",
      prefixe: cree.jeton.slice(0, 12),
      jetonHash: sha256Hex(cree.jeton),
      portee: "ecriture",
      creeLe: new Date(DEBUT),
      dernierUsageLe: null,
      revoqueLe: null,
    });
    const entrees = await journalDe(`jeton:${cree.id}`);
    expect(entrees).toHaveLength(1);
    expect(entrees[0]).toMatchObject({
      acteurType: "utilisateur",
      acteurId: acteur.id,
      action: "mcp.creer_jeton",
      details: { portee: "ecriture" },
    });
    const texte = JSON.stringify(entrees);
    expect(texte).not.toContain("Portable");
    expect(texte).not.toContain(cree.jeton);
    expect(texte).not.toContain(cree.jeton.slice(8));
  });

  it("tire un jeton différent à chaque création, en lecture seule si demandé", async () => {
    const { acteur } = await compte();
    const a = await creerJetonMcp(acteur, { nom: "Tablette", portee: "lecture" });
    const b = await creerJetonMcp(acteur, { nom: "Tablette", portee: "lecture" });
    expect(a.jeton).not.toBe(b.jeton);
    expect((await ligne(a.id))?.portee).toBe("lecture");
  });

  it.each([
    [{ nom: "   ", portee: "ecriture" }, "nom"],
    [{ nom: "x".repeat(61), portee: "ecriture" }, "nom"],
    [{ nom: `Tab${String.fromCharCode(0)}lette`, portee: "ecriture" }, "nom"],
    [{ nom: "Tablette", portee: "admin" }, "portee"],
  ])("refuse une saisie invalide (%j)", async (saisie, chemin) => {
    const { acteur } = await compte();
    const erreur = await creerJetonMcp(acteur, saisie).catch((e: unknown) => e);
    expect(erreur).toMatchObject({ code: "VALIDATION" });
    expect((erreur as { details: { chemin: string }[] }).details.map((d) => d.chemin)).toEqual([chemin]);
    expect(await db().select().from(jetonMcp).where(eq(jetonMcp.enseignantId, acteur.id))).toEqual([]);
  });

  it("refuse un onzième jeton actif ; un jeton révoqué ne compte pas", async () => {
    const { u, acteur } = await compte();
    await creerJetonMcpTest(u.id, { revoque: true });
    for (let i = 0; i < 9; i += 1) await creerJetonMcpTest(u.id);
    await creerJetonMcp(acteur, { nom: "Dixième", portee: "ecriture" });
    await expect(creerJetonMcp(acteur, { nom: "Onzième", portee: "ecriture" })).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGE_LIMITE_JETONS,
    });
  });

  it("n'accepte qu'une des deux créations simultanées qui dépasseraient la limite", async () => {
    const { u, acteur } = await compte();
    for (let i = 0; i < 9; i += 1) await creerJetonMcpTest(u.id);
    const resultats = await Promise.allSettled([
      creerJetonMcp(acteur, { nom: "A", portee: "ecriture" }),
      creerJetonMcp(acteur, { nom: "B", portee: "ecriture" }),
    ]);
    expect(resultats.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await listerJetonsMcp(acteur)).toHaveLength(10);
  });
});

describe("listerJetonsMcp", () => {
  it("liste les seuls jetons actifs du compte, du plus récent au plus ancien, sans empreinte", async () => {
    const { u, acteur } = await compte();
    const autre = await compte();
    const ancien = await creerJetonMcpTest(u.id, { nom: "Bureau", portee: "lecture" });
    horloge.avancer(60_000);
    const recent = await creerJetonMcpTest(u.id, { nom: "Portable", dernierUsageLe: new Date(DEBUT) });
    await creerJetonMcpTest(u.id, { revoque: true });
    await creerJetonMcpTest(autre.u.id);
    expect(await listerJetonsMcp(acteur)).toEqual([
      {
        id: recent.id,
        nom: "Portable",
        prefixe: recent.prefixe,
        portee: "ecriture",
        creeLe: new Date(DEBUT + 60_000),
        dernierUsageLe: new Date(DEBUT),
      },
      {
        id: ancien.id,
        nom: "Bureau",
        prefixe: ancien.prefixe,
        portee: "lecture",
        creeLe: new Date(DEBUT),
        dernierUsageLe: null,
      },
    ]);
  });
});

describe("revoquerJetonMcp", () => {
  it("révoque le jeton, journalise, et ne refait rien la seconde fois", async () => {
    const { u, acteur } = await compte();
    const j = await creerJetonMcpTest(u.id);
    await revoquerJetonMcp(acteur, { jetonId: j.id });
    expect((await ligne(j.id))?.revoqueLe).toEqual(new Date(DEBUT));
    horloge.avancer(60_000);
    await revoquerJetonMcp(acteur, { jetonId: j.id.toUpperCase() });
    expect((await ligne(j.id))?.revoqueLe).toEqual(new Date(DEBUT));
    const entrees = await journalDe(`jeton:${j.id}`);
    expect(entrees.map((e) => e.action)).toEqual(["mcp.revoquer_jeton"]);
    expect(await listerJetonsMcp(acteur)).toEqual([]);
  });

  it("répond « Jeton introuvable. » pour le jeton d'un autre compte, refus journalisé", async () => {
    const { acteur } = await compte();
    const autre = await compte();
    const j = await creerJetonMcpTest(autre.u.id);
    await expect(revoquerJetonMcp(acteur, { jetonId: j.id })).rejects.toMatchObject({
      code: "INTROUVABLE",
      message: "Jeton introuvable.",
    });
    expect((await ligne(j.id))?.revoqueLe).toBeNull();
    const refus = await db()
      .select()
      .from(journal)
      .where(and(eq(journal.acteurId, acteur.id), eq(journal.action, "acces.refus")));
    expect(refus.map((r) => r.details)).toEqual([
      { action: "mcp.revoquer_jeton", role: "enseignant", motif: "ressource_autrui" },
    ]);
  });

  it("répond « introuvable » sans journal pour un identifiant inconnu ou mal formé", async () => {
    const { acteur } = await compte();
    for (const jetonId of [randomUUID(), "pas-un-uuid"]) {
      await expect(revoquerJetonMcp(acteur, { jetonId })).rejects.toMatchObject({ code: "INTROUVABLE" });
    }
    expect(await db().select().from(journal).where(eq(journal.acteurId, acteur.id))).toEqual([]);
  });
});

describe("jetons gérés depuis Carreau seulement", () => {
  it("refuse la gestion des jetons à un acteur MCP", async () => {
    const { u } = await compte();
    const j = await creerJetonMcpTest(u.id);
    const mcp = acteurMcpDe(u);
    for (const appel of [
      () => creerJetonMcp(mcp, { nom: "Assistant", portee: "ecriture" }),
      () => listerJetonsMcp(mcp),
      () => revoquerJetonMcp(mcp, { jetonId: j.id }),
    ]) {
      await expect(appel()).rejects.toMatchObject({
        code: "ACCES_REFUSE",
        message: MESSAGE_JETONS_DEPUIS_CARREAU,
      });
    }
    expect((await ligne(j.id))?.revoqueLe).toBeNull();
  });
});
