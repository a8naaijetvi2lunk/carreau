import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { journal } from "@/db/schema";
import { erreurs } from "@/lib/erreurs";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { acteurDe, creerUtilisateur } from "@/test/comptes";
import { acteurMcpDe } from "@/test/mcp";
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

  it("journalise une ressource d'autrui, même levée dans une transaction, puis relance l'erreur", async () => {
    const a = await acteur();
    await expect(
      journaliserLesRefus(a, "test.autrui", async () =>
        db().transaction(async () => {
          throw erreurs.ressourceAutrui("Classe");
        }),
      ),
    ).rejects.toMatchObject({ code: "INTROUVABLE", message: "Classe introuvable." });
    const [entree] = await entreesRefus(a.id);
    expect(entree?.details).toEqual({ action: "test.autrui", role: "admin", motif: "ressource_autrui" });
  });

  it("une ressource simplement introuvable n'est pas journalisée", async () => {
    const a = await acteur();
    await expect(
      journaliserLesRefus(a, "test.introuvable", async () => {
        throw erreurs.introuvable("Classe");
      }),
    ).rejects.toMatchObject({ code: "INTROUVABLE" });
    expect(await entreesRefus(a.id)).toEqual([]);
  });

  it("signale le jeton MCP d'un refus venu d'un assistant", async () => {
    const u = await creerUtilisateur();
    const mcp = acteurMcpDe(u, "lecture", "11111111-1111-4111-8111-111111111111");
    await expect(
      journaliserLesRefus(mcp, "qcm.lire", async () => {
        throw erreurs.ressourceAutrui("QCM");
      }),
    ).rejects.toMatchObject({ code: "INTROUVABLE" });
    const [entree] = await entreesRefus(u.id);
    expect(entree?.details).toEqual({
      action: "qcm.lire",
      role: "enseignant",
      motif: "ressource_autrui",
      jetonMcpId: "11111111-1111-4111-8111-111111111111",
    });
  });
});
