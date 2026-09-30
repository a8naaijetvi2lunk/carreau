import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { jetonMcp, journal, limiteur, sessionConnexion, utilisateur } from "@/db/schema";
import { cleConnexionCompte, cleDoubleAuth, REGLE_CONNEXION_COMPTE, REGLE_DOUBLE_AUTH } from "@/modules/auth";
import { lireInvitation } from "@/modules/comptes";
import { reserver } from "@/modules/limiteur";
import { creerUtilisateur, ouvrirSessionComplete } from "@/test/comptes";
import { creerJetonMcpTest } from "@/test/mcp";
import { creerInvitationSuperAdmin } from "./admin-creer.mjs";
import { reinitialiserTotp } from "./admin-reinitialiser-totp.mjs";

const JOUR = 24 * 60 * 60 * 1000;
let pool: Pool;

beforeAll(() => {
  // Base isolée du fichier (src/test/base-isolee.ts), comme le module db.
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
});
afterAll(async () => {
  await pool.end();
});

function jetonDe(lien: string): string {
  return lien.slice(lien.lastIndexOf("/") + 1);
}

describe("admin:creer", () => {
  it("crée l'invitation du super-admin et renvoie un lien d'activation valable 7 jours", async () => {
    const avant = Date.now();
    const { lien, expireLe, invitationId } = await creerInvitationSuperAdmin(pool, {
      email: " Yves@Exemple.fr ",
      appUrl: "https://carreau.exemple.fr",
    });
    expect(lien).toMatch(/^https:\/\/carreau\.exemple\.fr\/activation\/[A-Za-z0-9_-]{43}$/);
    expect(expireLe.getTime()).toBeGreaterThanOrEqual(avant + 7 * JOUR);
    expect(await lireInvitation(jetonDe(lien))).toMatchObject({
      email: "yves@exemple.fr",
      role: "super_admin",
      etat: "valide",
    });
    const [entree] = await db()
      .select()
      .from(journal)
      .where(eq(journal.cible, `invitation:${invitationId}`));
    expect(entree).toMatchObject({
      acteurType: "systeme",
      action: "comptes.inviter",
      details: { role: "super_admin", origine: "script" },
    });
  });

  it("annule l'invitation en attente de la même adresse", async () => {
    const premier = await creerInvitationSuperAdmin(pool, {
      email: "deux@exemple.fr",
      appUrl: "http://localhost:50173",
    });
    const second = await creerInvitationSuperAdmin(pool, {
      email: "deux@exemple.fr",
      appUrl: "http://localhost:50173",
    });
    expect((await lireInvitation(jetonDe(premier.lien)))?.etat).toBe("annulee");
    expect((await lireInvitation(jetonDe(second.lien)))?.etat).toBe("valide");
  });

  it("refuse une adresse qui a déjà un compte ou mal formée", async () => {
    await creerUtilisateur({ email: "deja@exemple.fr" });
    await expect(
      creerInvitationSuperAdmin(pool, { email: "deja@exemple.fr", appUrl: "http://localhost:50173" }),
    ).rejects.toThrow("Un compte existe déjà");
    await expect(
      creerInvitationSuperAdmin(pool, { email: "pas-une-adresse", appUrl: "http://localhost:50173" }),
    ).rejects.toThrow("Adresse email invalide.");
  });
});

describe("admin:reinitialiser-totp", () => {
  it("efface le secret, ferme les sessions et lève les blocages du compte", async () => {
    const u = await creerUtilisateur({ role: "super_admin", email: "perdu@exemple.fr" });
    await ouvrirSessionComplete(u.id);
    await reserver(cleConnexionCompte(u.email), REGLE_CONNEXION_COMPTE);
    await reserver(cleDoubleAuth(u.id), REGLE_DOUBLE_AUTH);
    const jeton = await creerJetonMcpTest(u.id);

    expect(await reinitialiserTotp(pool, { email: "Perdu@Exemple.fr" })).toEqual({
      sessionsRevoquees: 1,
      jetonsMcpRevoques: 1,
    });
    const [jetonApres] = await db().select().from(jetonMcp).where(eq(jetonMcp.id, jeton.id));
    expect(jetonApres?.revoqueLe).not.toBeNull();

    const [apres] = await db().select().from(utilisateur).where(eq(utilisateur.id, u.id));
    expect(apres).toMatchObject({ totpSecretChiffre: null, totpDernierPas: null, actif: true });
    expect(
      await db().select().from(sessionConnexion).where(eq(sessionConnexion.utilisateurId, u.id)),
    ).toEqual([]);
    expect(
      await db()
        .select()
        .from(limiteur)
        .where(eq(limiteur.cle, cleDoubleAuth(u.id))),
    ).toEqual([]);
    expect(
      await db()
        .select()
        .from(limiteur)
        .where(eq(limiteur.cle, cleConnexionCompte(u.email))),
    ).toEqual([]);
    const [entree] = await db()
      .select()
      .from(journal)
      .where(eq(journal.cible, `utilisateur:${u.id}`));
    expect(entree).toMatchObject({ acteurType: "systeme", action: "comptes.reinitialiser_double_auth" });
  });

  it("refuse une adresse sans compte", async () => {
    await expect(reinitialiserTotp(pool, { email: "personne@exemple.fr" })).rejects.toThrow(
      "Aucun compte pour cette adresse.",
    );
  });
});
