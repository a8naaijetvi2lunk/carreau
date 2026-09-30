import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { jetonMcp, utilisateur } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { creerUtilisateur } from "@/test/comptes";
import { creerJetonMcpTest } from "@/test/mcp";
import { verifierJetonMcp } from "./verification";

const DEBUT = Date.parse("2026-09-30T08:00:00.000Z");
const horloge = horlogeFixe(DEBUT);

beforeEach(() => {
  horloge.fixer(DEBUT);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

async function dernierUsage(id: string) {
  const [ligne] = await db()
    .select({ le: jetonMcp.dernierUsageLe })
    .from(jetonMcp)
    .where(eq(jetonMcp.id, id));
  return ligne?.le ?? null;
}

describe("verifierJetonMcp", () => {
  it("rend l'acteur MCP du compte, sans session de connexion", async () => {
    const u = await creerUtilisateur({ nom: "Arnaud", prenom: "Claire", role: "admin" });
    const j = await creerJetonMcpTest(u.id, { portee: "lecture" });
    expect(await verifierJetonMcp(`Bearer ${j.jeton}`)).toEqual({
      type: "utilisateur",
      id: u.id,
      sessionId: null,
      jetonMcp: { id: j.id, portee: "lecture" },
      email: u.email,
      nom: "Arnaud",
      prenom: "Claire",
      role: "admin",
    });
    expect(await verifierJetonMcp(`bearer \t${j.jeton}`)).not.toBeNull();
  });

  it("écrit le dernier usage au plus une fois par minute", async () => {
    const u = await creerUtilisateur();
    const j = await creerJetonMcpTest(u.id);
    await verifierJetonMcp(`Bearer ${j.jeton}`);
    expect(await dernierUsage(j.id)).toEqual(new Date(DEBUT));
    horloge.avancer(30_000);
    await verifierJetonMcp(`Bearer ${j.jeton}`);
    expect(await dernierUsage(j.id)).toEqual(new Date(DEBUT));
    horloge.avancer(31_000);
    await verifierJetonMcp(`Bearer ${j.jeton}`);
    expect(await dernierUsage(j.id)).toEqual(new Date(DEBUT + 61_000));
  });

  it("refuse un en-tête absent ou mal formé et un jeton inconnu", async () => {
    const u = await creerUtilisateur();
    const j = await creerJetonMcpTest(u.id);
    const inconnu = `carreau_${"B".repeat(43)}`;
    for (const entete of [
      null,
      "",
      j.jeton,
      `Basic ${j.jeton}`,
      `Bearer ${j.jeton.slice(0, -1)}`,
      `Bearer ${j.jeton.replace("carreau_", "")}`,
      `Bearer ${inconnu}`,
    ]) {
      expect(await verifierJetonMcp(entete)).toBeNull();
    }
    expect(await dernierUsage(j.id)).toBeNull();
  });

  it("refuse un jeton révoqué et le jeton d'un compte désactivé", async () => {
    const u = await creerUtilisateur();
    const revoque = await creerJetonMcpTest(u.id, { revoque: true });
    expect(await verifierJetonMcp(`Bearer ${revoque.jeton}`)).toBeNull();

    const desactive = await creerUtilisateur();
    const j = await creerJetonMcpTest(desactive.id);
    await db().update(utilisateur).set({ actif: false }).where(eq(utilisateur.id, desactive.id));
    expect(await verifierJetonMcp(`Bearer ${j.jeton}`)).toBeNull();
    expect(await dernierUsage(j.id)).toBeNull();
  });
});
