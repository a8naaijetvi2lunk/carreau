import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { journal } from "@/db/schema";
import { erreurs } from "@/lib/erreurs";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { acteurDe, creerUtilisateur } from "@/test/comptes";
import { journaliserLesRefus } from "./refus";

beforeEach(() => definirHorlogePourLesTests(horlogeFixe(Date.parse("2026-09-29T08:00:00.000Z"))));
afterEach(() => definirHorlogePourLesTests());

async function acteur() {
  return acteurDe(await creerUtilisateur({ role: "admin" }));
}

/** Une base isolée par fichier (pas par test) : filtre par acteur pour ne pas voir les autres cas. */
async function entreesRefus(acteurId: string) {
  return db()
    .select()
    .from(journal)
    .where(and(eq(journal.action, "acces.refus"), eq(journal.acteurId, acteurId)));
}

describe("journaliserLesRefus", () => {
  it("un service qui réussit ne journalise rien", async () => {
    const a = await acteur();
    await expect(journaliserLesRefus(a, "test.action", async () => "ok")).resolves.toBe("ok");
    expect(await entreesRefus(a.id)).toEqual([]);
  });

  it("journalise un refus d'accès puis relance l'erreur", async () => {
    const a = await acteur();
    await expect(
      journaliserLesRefus(a, "test.refus", async () => {
        throw erreurs.accesRefuse();
      }),
    ).rejects.toMatchObject({ code: "ACCES_REFUSE" });
    const [entree] = await entreesRefus(a.id);
    expect(entree).toMatchObject({
      acteurType: "utilisateur",
      acteurId: a.id,
      details: { action: "test.refus", role: "admin" },
    });
  });

  it("un refus levé dans une transaction annulée est quand même journalisé", async () => {
    const a = await acteur();
    await expect(
      journaliserLesRefus(a, "test.transaction", async () =>
        db().transaction(async () => {
          throw erreurs.accesRefuse();
        }),
      ),
    ).rejects.toMatchObject({ code: "ACCES_REFUSE" });
    const [entree] = await entreesRefus(a.id);
    expect(entree?.details).toEqual({ action: "test.transaction", role: "admin" });
  });

  it("une autre erreur n'est pas journalisée", async () => {
    const a = await acteur();
    await expect(
      journaliserLesRefus(a, "test.validation", async () => {
        throw erreurs.validation("invalide");
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await entreesRefus(a.id)).toEqual([]);
  });
});
