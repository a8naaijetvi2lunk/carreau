import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { journal } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { reserverJournalise } from "@/modules/limiteur";

const REGLE = { seuil: 2, fenetreSecondes: 60, blocageSecondes: 60 };

beforeEach(() => definirHorlogePourLesTests(horlogeFixe(Date.parse("2026-09-29T08:00:00.000Z"))));
afterEach(() => definirHorlogePourLesTests());

describe("reserverJournalise", () => {
  it("laisse passer sous le seuil sans rien journaliser", async () => {
    await reserverJournalise("test:a", REGLE, { action: "test.limite" });
    await reserverJournalise("test:a", REGLE, { action: "test.limite" });
    expect(await db().select().from(journal).where(eq(journal.action, "test.limite"))).toEqual([]);
  });

  it("journalise le refus puis relance LIMITE_ATTEINTE", async () => {
    await reserverJournalise("test:b", REGLE, { action: "test.limite_b", cible: "utilisateur:x" });
    await reserverJournalise("test:b", REGLE, { action: "test.limite_b", cible: "utilisateur:x" });
    await expect(
      reserverJournalise("test:b", REGLE, { action: "test.limite_b", cible: "utilisateur:x" }),
    ).rejects.toMatchObject({ code: "LIMITE_ATTEINTE" });
    const lignes = await db().select().from(journal).where(eq(journal.action, "test.limite_b"));
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ acteurType: "anonyme", cible: "utilisateur:x", details: {} });
  });

  it("relance les autres erreurs sans journaliser", async () => {
    await expect(
      reserverJournalise(
        "test:c",
        { seuil: 0, fenetreSecondes: 60, blocageSecondes: 60 },
        { action: "test.limite_c" },
      ),
    ).rejects.toThrow("Règle de limiteur invalide");
    expect(await db().select().from(journal).where(eq(journal.action, "test.limite_c"))).toEqual([]);
  });
});
