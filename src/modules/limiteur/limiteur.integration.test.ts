import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { limiteur } from "@/db/schema";
import { ErreurService } from "@/lib/erreurs";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { annuler, effacer, purgerLimiteur, reserver, type RegleLimite } from "./limiteur";

const DEBUT = Date.UTC(2026, 8, 28, 8, 0, 0);
const REGLE: RegleLimite = { seuil: 3, fenetreSecondes: 60, blocageSecondes: 120 };

let horloge: ReturnType<typeof horlogeFixe>;

beforeEach(() => {
  horloge = horlogeFixe(DEBUT);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

async function refus(promesse: Promise<void>): Promise<ErreurService> {
  try {
    await promesse;
  } catch (erreur) {
    if (erreur instanceof ErreurService) return erreur;
    throw erreur;
  }
  throw new Error("La réservation aurait dû être refusée.");
}

async function cles(): Promise<string[]> {
  return (await db().select({ cle: limiteur.cle }).from(limiteur)).map((ligne) => ligne.cle).sort();
}

describe("reserver", () => {
  it("autorise le seuil puis refuse avec le délai restant", async () => {
    for (let i = 0; i < 3; i++) await reserver("t:seuil", REGLE);
    const erreur = await refus(reserver("t:seuil", REGLE));
    expect(erreur.code).toBe("LIMITE_ATTEINTE");
    expect(erreur.details).toEqual({ reessayerApresSecondes: 120 });
    expect(erreur.message).toBe("Trop de tentatives. Réessaie dans 2 minutes.");
  });

  it("ne prolonge pas un blocage en cours et fige le compteur", async () => {
    for (let i = 0; i < 3; i++) await reserver("t:fige", REGLE);
    horloge.avancer(30_000);
    expect((await refus(reserver("t:fige", REGLE))).details).toEqual({ reessayerApresSecondes: 90 });
    expect((await refus(reserver("t:fige", REGLE))).details).toEqual({ reessayerApresSecondes: 90 });
    const [ligne] = await db().select().from(limiteur).where(eq(limiteur.cle, "t:fige"));
    expect(ligne?.compteur).toBe(4);
  });

  it("repart à zéro quand la fenêtre expire sans blocage", async () => {
    await reserver("t:fenetre", REGLE);
    await reserver("t:fenetre", REGLE);
    horloge.avancer(61_000);
    for (let i = 0; i < 3; i++) await reserver("t:fenetre", REGLE);
    await expect(reserver("t:fenetre", REGLE)).rejects.toMatchObject({ code: "LIMITE_ATTEINTE" });
  });

  it("repart à zéro à la fin du blocage, même si la fenêtre court encore", async () => {
    const regle: RegleLimite = { seuil: 2, fenetreSecondes: 600, blocageSecondes: 60 };
    await reserver("t:fin", regle);
    await reserver("t:fin", regle);
    await expect(reserver("t:fin", regle)).rejects.toMatchObject({ code: "LIMITE_ATTEINTE" });
    horloge.avancer(61_000);
    await reserver("t:fin", regle);
    await reserver("t:fin", regle);
    await expect(reserver("t:fin", regle)).rejects.toMatchObject({ code: "LIMITE_ATTEINTE" });
  });

  it("avec un seuil de 1, autorise un essai puis bloque", async () => {
    const regle: RegleLimite = { seuil: 1, fenetreSecondes: 60, blocageSecondes: 60 };
    await reserver("t:unique", regle);
    await expect(reserver("t:unique", regle)).rejects.toMatchObject({ code: "LIMITE_ATTEINTE" });
    horloge.avancer(61_000);
    await expect(reserver("t:unique", regle)).resolves.toBeUndefined();
  });

  it("isole les clés entre elles", async () => {
    for (let i = 0; i < 3; i++) await reserver("t:a", REGLE);
    await expect(reserver("t:b", REGLE)).resolves.toBeUndefined();
  });

  it("laisse passer exactement le seuil sous des essais simultanés", async () => {
    const regle: RegleLimite = { seuil: 5, fenetreSecondes: 60, blocageSecondes: 60 };
    const resultats = await Promise.allSettled(
      Array.from({ length: 20 }, () => reserver("t:concurrence", regle)),
    );
    expect(resultats.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(resultats.filter((r) => r.status === "rejected")).toHaveLength(15);
  });

  it("refuse une règle invalide", async () => {
    await expect(reserver("t:regle", { seuil: 0, fenetreSecondes: 60, blocageSecondes: 60 })).rejects.toThrow(
      /Règle de limiteur invalide/,
    );
  });
});

describe("annuler et effacer", () => {
  it("annuler rend un essai et lève le blocage", async () => {
    for (let i = 0; i < 3; i++) await reserver("t:annuler", REGLE);
    await annuler("t:annuler", REGLE);
    await expect(reserver("t:annuler", REGLE)).resolves.toBeUndefined();
    await expect(reserver("t:annuler", REGLE)).rejects.toMatchObject({ code: "LIMITE_ATTEINTE" });
  });

  it("annuler supprime une clé revenue à zéro", async () => {
    await reserver("t:zero", REGLE);
    await annuler("t:zero", REGLE);
    expect(await db().select().from(limiteur).where(eq(limiteur.cle, "t:zero"))).toEqual([]);
  });

  it("effacer supprime les seules clés données", async () => {
    await reserver("t:e1", REGLE);
    await reserver("t:e2", REGLE);
    await effacer(["t:e1"]);
    const restantes = await cles();
    expect(restantes).not.toContain("t:e1");
    expect(restantes).toContain("t:e2");
  });

  it("effacer sans clé ne fait rien", async () => {
    await expect(effacer([])).resolves.toBeUndefined();
  });
});

describe("purgerLimiteur", () => {
  it("supprime les clés anciennes sans blocage actif et garde les blocages en cours", async () => {
    await db().delete(limiteur);
    await reserver("t:vieille", REGLE);
    for (let i = 0; i < 3; i++)
      await reserver("t:bloquee", { seuil: 3, fenetreSecondes: 60, blocageSecondes: 86_400 });
    horloge.avancer(3_600_000);
    expect(await purgerLimiteur(1800)).toBe(1);
    expect(await cles()).toEqual(["t:bloquee"]);
  });
});
