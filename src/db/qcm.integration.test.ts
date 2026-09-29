import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { image, proposition, qcm, question, utilisateur } from "@/db/schema";

const INSTANT = new Date("2026-09-29T08:00:00.000Z");

/** SQLSTATE de l'erreur levée par `action` (cherché dans les causes), ou undefined si rien n'est levé. */
async function codeSql(action: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await action();
    return undefined;
  } catch (erreur) {
    let courant: unknown = erreur;
    while (typeof courant === "object" && courant !== null) {
      const code = (courant as { code?: unknown }).code;
      if (typeof code === "string") return code;
      courant = (courant as { cause?: unknown }).cause;
    }
    return "inconnu";
  }
}

let compteur = 0;

async function enseignant() {
  compteur += 1;
  const [u] = await db()
    .insert(utilisateur)
    .values({
      email: `qcm${compteur}@exemple.fr`,
      nom: "Arnaud",
      prenom: "Claire",
      role: "enseignant",
      motDePasseHash: "h",
      creeLe: INSTANT,
    })
    .returning();
  if (!u) throw new Error("utilisateur non créé");
  return u;
}

async function nouveauQcm(enseignantId: string) {
  const [q] = await db()
    .insert(qcm)
    .values({ enseignantId, titre: "Algorithmique", creeLe: INSTANT, modifieLe: INSTANT })
    .returning();
  if (!q) throw new Error("qcm non créé");
  return q;
}

async function nouvelleQuestion(
  qcmId: string,
  position: number,
  valeurs: Partial<typeof question.$inferInsert> = {},
) {
  const [q] = await db()
    .insert(question)
    .values({ qcmId, position, ...valeurs })
    .returning();
  if (!q) throw new Error("question non créée");
  return q;
}

async function nouvelleImage(enseignantId: string) {
  const [i] = await db()
    .insert(image)
    .values({ id: randomUUID(), enseignantId, largeur: 640, hauteur: 480, octets: 1000, creeLe: INSTANT })
    .returning();
  if (!i) throw new Error("image non créée");
  return i;
}

describe("tables des QCM", () => {
  it("crée un QCM en brouillon, sans chrono, note visible et correction masquée par défaut", async () => {
    const u = await enseignant();
    const q = await nouveauQcm(u.id);
    expect(q).toMatchObject({
      statut: "brouillon",
      origine: "interface",
      modeChrono: "aucun",
      dureeGlobaleS: null,
      noteVisibleDefaut: true,
      correctionVisibleDefaut: false,
    });
  });

  it("donne à une question ses valeurs par défaut et lit le barème comme des nombres", async () => {
    const u = await enseignant();
    const q = await nouveauQcm(u.id);
    const creee = await nouvelleQuestion(q.id, 1, { pointsMauvaise: -0.25 });
    expect(creee).toMatchObject({
      type: "unique",
      enonce: "",
      pointsBonne: 1,
      pointsMauvaise: -0.25,
      pointsVide: 0,
      lieeASuivante: false,
      codeLangage: null,
    });
  });

  it("refuse deux questions à la même position d'un QCM, pas dans deux QCM", async () => {
    const u = await enseignant();
    const a = await nouveauQcm(u.id);
    const b = await nouveauQcm(u.id);
    await nouvelleQuestion(a.id, 1);
    expect(await codeSql(() => nouvelleQuestion(a.id, 1))).toBe("23505");
    expect(await codeSql(() => nouvelleQuestion(b.id, 1))).toBeUndefined();
  });

  it("refuse un langage sans code, ou un code sans langage", async () => {
    const u = await enseignant();
    const q = await nouveauQcm(u.id);
    expect(await codeSql(() => nouvelleQuestion(q.id, 1, { codeLangage: "python" }))).toBe("23514");
    expect(await codeSql(() => nouvelleQuestion(q.id, 2, { codeSource: "print(1)" }))).toBe("23514");
    expect(
      await codeSql(() => nouvelleQuestion(q.id, 3, { codeLangage: "python", codeSource: "print(1)" })),
    ).toBeUndefined();
  });

  it("refuse deux réponses à la même position d'une question", async () => {
    const u = await enseignant();
    const q = await nouveauQcm(u.id);
    const qu = await nouvelleQuestion(q.id, 1);
    await db().insert(proposition).values({ questionId: qu.id, position: 1, texte: "Oui" });
    expect(await codeSql(() => db().insert(proposition).values({ questionId: qu.id, position: 1 }))).toBe(
      "23505",
    );
  });

  it("supprime les réponses avec leur question, et les questions avec leur QCM", async () => {
    const u = await enseignant();
    const q = await nouveauQcm(u.id);
    const qu = await nouvelleQuestion(q.id, 1);
    await db().insert(proposition).values({ questionId: qu.id, position: 1, texte: "Oui" });
    await db().delete(qcm).where(eq(qcm.id, q.id));
    expect(await db().select().from(question).where(eq(question.qcmId, q.id))).toEqual([]);
    expect(await db().select().from(proposition).where(eq(proposition.questionId, qu.id))).toEqual([]);
  });

  it("refuse de supprimer une image citée par une question ou une réponse", async () => {
    const u = await enseignant();
    const q = await nouveauQcm(u.id);
    const i1 = await nouvelleImage(u.id);
    const i2 = await nouvelleImage(u.id);
    const qu = await nouvelleQuestion(q.id, 1, { imageId: i1.id });
    await db().insert(proposition).values({ questionId: qu.id, position: 1, imageId: i2.id });
    expect(await codeSql(() => db().delete(image).where(eq(image.id, i1.id)))).toBe("23503");
    expect(await codeSql(() => db().delete(image).where(eq(image.id, i2.id)))).toBe("23503");
  });

  it("refuse de supprimer un compte qui a des QCM ou des images", async () => {
    const a = await enseignant();
    await nouveauQcm(a.id);
    expect(await codeSql(() => db().delete(utilisateur).where(eq(utilisateur.id, a.id)))).toBe("23503");
    const b = await enseignant();
    await nouvelleImage(b.id);
    expect(await codeSql(() => db().delete(utilisateur).where(eq(utilisateur.id, b.id)))).toBe("23503");
  });
});
