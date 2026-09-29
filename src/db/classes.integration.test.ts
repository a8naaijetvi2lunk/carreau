import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { classe, etudiant, utilisateur } from "@/db/schema";

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
      email: `classes${compteur}@exemple.fr`,
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

async function nouvelleClasse(enseignantId: string, nom: string) {
  const [c] = await db().insert(classe).values({ enseignantId, nom, creeLe: INSTANT }).returning();
  if (!c) throw new Error("classe non créée");
  return c;
}

function nouvelEtudiant(classeId: string, nomNormalise: string, prenomNormalise: string) {
  return db()
    .insert(etudiant)
    .values({
      classeId,
      nom: nomNormalise,
      prenom: prenomNormalise,
      nomNormalise,
      prenomNormalise,
      creeLe: INSTANT,
    })
    .returning();
}

describe("tables des classes", () => {
  it("crée une classe non archivée par défaut", async () => {
    const u = await enseignant();
    const c = await nouvelleClasse(u.id, "TD2");
    expect(c.archivee).toBe(false);
  });

  it("refuse deux classes du même compte au nom identique à la casse près", async () => {
    const u = await enseignant();
    await nouvelleClasse(u.id, "TD2");
    expect(await codeSql(() => nouvelleClasse(u.id, "td2"))).toBe("23505");
  });

  it("accepte le même nom de classe pour deux comptes différents", async () => {
    const a = await enseignant();
    const b = await enseignant();
    await nouvelleClasse(a.id, "TD2");
    expect(await codeSql(() => nouvelleClasse(b.id, "TD2"))).toBeUndefined();
  });

  it("refuse deux étudiants aux noms normalisés identiques dans une classe, pas dans deux classes", async () => {
    const u = await enseignant();
    const c1 = await nouvelleClasse(u.id, "TD1");
    const c2 = await nouvelleClasse(u.id, "TD3");
    await nouvelEtudiant(c1.id, "dupont", "lea");
    expect(await codeSql(() => nouvelEtudiant(c1.id, "dupont", "lea"))).toBe("23505");
    expect(await codeSql(() => nouvelEtudiant(c2.id, "dupont", "lea"))).toBeUndefined();
  });

  it("refuse de supprimer un compte qui a des classes", async () => {
    const u = await enseignant();
    await nouvelleClasse(u.id, "TD4");
    expect(await codeSql(() => db().delete(utilisateur).where(eq(utilisateur.id, u.id)))).toBe("23503");
  });

  it("supprime les étudiants avec leur classe", async () => {
    const u = await enseignant();
    const c = await nouvelleClasse(u.id, "TD5");
    await nouvelEtudiant(c.id, "martin", "ines");
    await db().delete(classe).where(eq(classe.id, c.id));
    expect(await db().select().from(etudiant).where(eq(etudiant.classeId, c.id))).toEqual([]);
  });
});
