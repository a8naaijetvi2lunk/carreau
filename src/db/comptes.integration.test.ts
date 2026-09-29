import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { invitation, jetonMcp, parametres, sessionConnexion, utilisateur } from "@/db/schema";

const INSTANT = new Date("2026-09-29T08:00:00.000Z");
const PLUS_TARD = new Date("2026-10-06T08:00:00.000Z");

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

async function creerUtilisateur(email: string) {
  const [u] = await db()
    .insert(utilisateur)
    .values({
      email,
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

function valeursInvitation(email: string, jetonHash: string) {
  return { email, role: "enseignant" as const, jetonHash, creeLe: INSTANT, expireLe: PLUS_TARD };
}

describe("schéma des comptes", () => {
  it("impose un email unique et en minuscules", async () => {
    await creerUtilisateur("claire@exemple.fr");
    expect(await codeSql(() => creerUtilisateur("claire@exemple.fr"))).toBe("23505");
    expect(await codeSql(() => creerUtilisateur("Paul@Exemple.fr"))).toBe("23514");
  });

  it("n'autorise qu'une invitation en attente par adresse", async () => {
    await db().insert(invitation).values(valeursInvitation("julie@exemple.fr", "h1"));
    expect(
      await codeSql(() => db().insert(invitation).values(valeursInvitation("julie@exemple.fr", "h2"))),
    ).toBe("23505");
    await db().update(invitation).set({ annuleeLe: INSTANT }).where(eq(invitation.jetonHash, "h1"));
    expect(
      await codeSql(() => db().insert(invitation).values(valeursInvitation("julie@exemple.fr", "h3"))),
    ).toBeUndefined();
  });

  it("garde une seule ligne de paramètres, validité des invitations entre 1 et 30 jours", async () => {
    await db().insert(parametres).values({ id: 1 });
    const [ligne] = await db().select().from(parametres);
    expect(ligne?.validiteInvitationJours).toBe(7);
    expect(ligne?.conservationEvenementsJours).toBeNull();
    expect(await codeSql(() => db().insert(parametres).values({ id: 2 }))).toBe("23514");
    expect(
      await codeSql(() =>
        db().update(parametres).set({ validiteInvitationJours: 0 }).where(eq(parametres.id, 1)),
      ),
    ).toBe("23514");
  });

  it("supprime sessions et jetons MCP avec le compte, garde l'invitation sans inviteur", async () => {
    const u = await creerUtilisateur("paul@exemple.fr");
    await db().insert(sessionConnexion).values({
      utilisateurId: u.id,
      jetonHash: "s1",
      creeLe: INSTANT,
      derniereActiviteLe: INSTANT,
      expireLe: PLUS_TARD,
    });
    await db().insert(jetonMcp).values({
      enseignantId: u.id,
      nom: "Assistant",
      prefixe: "carreau_ab",
      jetonHash: "m1",
      portee: "lecture",
      creeLe: INSTANT,
    });
    await db()
      .insert(invitation)
      .values({ ...valeursInvitation("sophie@exemple.fr", "h9"), invitePar: u.id });

    await db().delete(utilisateur).where(eq(utilisateur.id, u.id));

    expect(
      await db().select().from(sessionConnexion).where(eq(sessionConnexion.utilisateurId, u.id)),
    ).toEqual([]);
    expect(await db().select().from(jetonMcp).where(eq(jetonMcp.enseignantId, u.id))).toEqual([]);
    const [inv] = await db().select().from(invitation).where(eq(invitation.jetonHash, "h9"));
    expect(inv?.invitePar).toBeNull();
  });
});
