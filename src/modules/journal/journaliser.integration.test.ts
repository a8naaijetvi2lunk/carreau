import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { journal } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { journaliser } from "./journaliser";

describe("journaliser", () => {
  afterEach(() => definirHorlogePourLesTests());

  it("écrit une entrée horodatée par l'horloge applicative", async () => {
    definirHorlogePourLesTests(horlogeFixe(Date.UTC(2026, 8, 28, 9, 0, 0)));
    await journaliser({
      acteur: { type: "systeme" },
      action: "socle.verification",
      cible: "base",
      details: { essai: 1 },
    });
    const [entree] = await db().select().from(journal).where(eq(journal.action, "socle.verification"));
    expect(entree).toMatchObject({
      acteurType: "systeme",
      acteurId: null,
      cible: "base",
      details: { essai: 1 },
    });
    expect(entree?.creeLe.toISOString()).toBe("2026-09-28T09:00:00.000Z");
  });

  it("enregistre l'identifiant de l'acteur et des détails vides par défaut", async () => {
    const id = "0b9f3c2e-6a1d-4f7e-9c3b-2d5e8f1a4b6c";
    await journaliser({ acteur: { type: "utilisateur", id }, action: "socle.identite" });
    const [entree] = await db().select().from(journal).where(eq(journal.action, "socle.identite"));
    expect(entree).toMatchObject({ acteurType: "utilisateur", acteurId: id, cible: null, details: {} });
  });

  it("refuse une action hors du format domaine.verbe", async () => {
    await expect(journaliser({ acteur: { type: "anonyme" }, action: "Verification" })).rejects.toThrow(
      /domaine\.verbe/,
    );
  });

  it("écrit dans la transaction de l'appelant et suit son annulation", async () => {
    await expect(
      db().transaction(async (tx) => {
        await journaliser({ acteur: { type: "systeme" }, action: "socle.annulation" }, tx);
        throw new Error("annulation voulue");
      }),
    ).rejects.toThrow("annulation voulue");
    expect(await db().select().from(journal).where(eq(journal.action, "socle.annulation"))).toEqual([]);
  });
});
