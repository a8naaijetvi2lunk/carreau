import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { journal } from "@/db/schema";
import { reinitialiserEnvPourLesTests } from "@/lib/env";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { utiliserDossierImagesTemporaire } from "@/test/images";
import * as route from "./route";

// Valeur de test, sans valeur réelle : 42 caractères, sans espace.
const SECRET = "secret-de-test-des-purges-0123456789abcdef";
const DEBUT = Date.parse("2026-09-30T02:30:00.000Z");
const MESSAGE_REFUS = "[purges] Appel refusé : secret absent ou invalide.";
const horloge = horlogeFixe(DEBUT);
utiliserDossierImagesTemporaire();

let secretPrecedent: string | undefined;

function definirSecret(valeur: string | undefined): void {
  if (valeur === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = valeur;
  reinitialiserEnvPourLesTests();
}

beforeAll(() => {
  secretPrecedent = process.env.CRON_SECRET;
  definirSecret(SECRET);
});
afterAll(() => definirSecret(secretPrecedent));
beforeEach(() => {
  horloge.fixer(DEBUT);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => {
  definirHorlogePourLesTests();
  vi.restoreAllMocks();
});

function appel(entete?: string): Request {
  return new Request("http://localhost/api/cron/purges", {
    method: "POST",
    headers: entete === undefined ? {} : { authorization: entete },
  });
}

async function executions(): Promise<number> {
  return (await db().select().from(journal).where(eq(journal.action, "purges.executer"))).length;
}

describe("route /api/cron/purges (décision D5 du plan du lot 10)", () => {
  it("ne sert que POST", () => {
    expect(Object.keys(route).sort()).toEqual(["POST", "dynamic"]);
  });

  it.each([
    ["sans en-tête", undefined],
    ["vide", ""],
    ["sans le mot Bearer", SECRET],
    ["avec Bearer seul", "Bearer "],
    ["d'un autre schéma", `Basic ${SECRET}`],
    ["au secret faux", `Bearer ${SECRET}x`],
    ["au secret tronqué", `Bearer ${SECRET.slice(0, -1)}`],
    ["à deux mots", `Bearer ${SECRET} ${SECRET}`],
  ])("refuse un appel %s : 401, aucune purge, secret jamais écrit", async (_cas, entete) => {
    const avertissement = vi.spyOn(console, "warn").mockImplementation(() => {});
    const reponse = await route.POST(appel(entete));
    expect(reponse.status).toBe(401);
    expect(reponse.headers.get("cache-control")).toBe("no-store");
    const corps = await reponse.text();
    expect(JSON.parse(corps)).toEqual({
      erreur: { code: "NON_CONNECTE", message: "Secret de la tâche planifiée absent ou invalide." },
    });
    expect(corps).not.toContain(SECRET.slice(0, 12));
    expect(avertissement).toHaveBeenCalledOnce();
    expect(avertissement).toHaveBeenCalledWith(MESSAGE_REFUS);
    expect(await executions()).toBe(0);
  });

  it("purge avec le bon secret, quelle que soit la casse de Bearer, et renvoie le bilan", async () => {
    const reponse = await route.POST(appel(`bearer ${SECRET}`));
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("cache-control")).toBe("no-store");
    expect(await reponse.json()).toMatchObject({ conservationRenseignee: false, erreurs: [] });
    expect(await executions()).toBe(1);
  });

  it("refuse tout appel quand CRON_SECRET n'est pas configuré", async () => {
    const avertissement = vi.spyOn(console, "warn").mockImplementation(() => {});
    definirSecret("");
    try {
      expect((await route.POST(appel("Bearer "))).status).toBe(401);
      expect((await route.POST(appel(`Bearer ${SECRET}`))).status).toBe(401);
    } finally {
      definirSecret(SECRET);
    }
    expect(avertissement).toHaveBeenCalledTimes(2);
  });
});
