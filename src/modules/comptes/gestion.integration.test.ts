import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { jetonMcp, journal, utilisateur } from "@/db/schema";
import type { ActeurUtilisateur, Role } from "@/lib/acteur";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { connecter, preparerDoubleAuth, validerJetonSession } from "@/modules/auth";
import {
  changerRole,
  desactiverCompte,
  inviter,
  listerComptes,
  MESSAGE_PROPRE_COMPTE,
  reactiverCompte,
  reinitialiserDoubleAuth,
} from "@/modules/comptes";
import { acteurDe, creerUtilisateur, MOT_DE_PASSE_TEST, ouvrirSessionComplete } from "@/test/comptes";
import { creerJetonMcpTest } from "@/test/mcp";

const DEBUT = Date.parse("2026-09-29T08:00:00.000Z");

beforeEach(() => definirHorlogePourLesTests(horlogeFixe(DEBUT)));
afterEach(() => definirHorlogePourLesTests());

async function compte(role: Role, options: { actif?: boolean; totp?: boolean } = {}) {
  return creerUtilisateur({ role, ...options });
}

async function acteur(role: Role): Promise<ActeurUtilisateur> {
  return acteurDe(await compte(role));
}

async function lire(id: string) {
  const [ligne] = await db().select().from(utilisateur).where(eq(utilisateur.id, id));
  return ligne;
}

type Action = "desactiver" | "reinitialiser_double_auth" | "changer_role";

function executer(action: Action, a: ActeurUtilisateur, cible: { id: string; role: Role }): Promise<void> {
  if (action === "desactiver") return desactiverCompte(a, { utilisateurId: cible.id });
  if (action === "reinitialiser_double_auth") return reinitialiserDoubleAuth(a, { utilisateurId: cible.id });
  return changerRole(a, {
    utilisateurId: cible.id,
    role: cible.role === "enseignant" ? "admin" : "enseignant",
  });
}

describe("matrice des droits (rôle de l'acteur × rôle de la cible × action)", () => {
  const cas: [Role, Role, Action, "ok" | "ACCES_REFUSE"][] = [];
  const roles: Role[] = ["enseignant", "admin", "super_admin"];
  const actions: Action[] = ["desactiver", "reinitialiser_double_auth", "changer_role"];
  for (const roleActeur of roles) {
    for (const roleCible of roles) {
      for (const action of actions) {
        const autorise =
          roleActeur === "super_admin" ||
          (roleActeur === "admin" && roleCible === "enseignant" && action !== "changer_role");
        cas.push([roleActeur, roleCible, action, autorise ? "ok" : "ACCES_REFUSE"]);
      }
    }
  }

  it.each(cas)("%s → compte %s, %s : %s", async (roleActeur, roleCible, action, attendu) => {
    const a = await acteur(roleActeur);
    const cible = await compte(roleCible);
    const resultat = executer(action, a, cible);
    if (attendu === "ok") {
      await expect(resultat).resolves.toBeUndefined();
    } else {
      await expect(resultat).rejects.toMatchObject({ code: attendu });
      const [entree] = await db()
        .select()
        .from(journal)
        .where(and(eq(journal.action, "acces.refus"), eq(journal.acteurId, a.id)));
      expect(entree?.details).toMatchObject({ action: `comptes.${action}` });
    }
  });

  it("un enseignant ne voit pas la liste des comptes", async () => {
    await expect(listerComptes(await acteur("enseignant"))).rejects.toMatchObject({ code: "ACCES_REFUSE" });
  });
});

describe("listerComptes", () => {
  it("donne les comptes, les invitations en attente et les actions permises à l'acteur", async () => {
    const superAdmin = await acteur("super_admin");
    const admin = acteurDe(await compte("admin"));
    const enseignant = await compte("enseignant");
    const desactive = await compte("enseignant", { actif: false });
    const sansTotp = await compte("enseignant", { totp: false });
    const invitationEnseignant = await inviter(superAdmin, {
      email: "liste.ens@exemple.fr",
      role: "enseignant",
    });
    const invitationAdmin = await inviter(superAdmin, { email: "liste.adm@exemple.fr", role: "admin" });

    const vueAdmin = await listerComptes(admin);
    const actionsDe = (id: string) => vueAdmin.comptes.find((c) => c.id === id)?.actions;
    expect(actionsDe(admin.id)).toEqual([]);
    expect(vueAdmin.comptes.find((c) => c.id === admin.id)?.estActeur).toBe(true);
    expect(actionsDe(superAdmin.id)).toEqual([]);
    expect(actionsDe(enseignant.id)).toEqual(["desactiver", "reinitialiser_double_auth"]);
    expect(actionsDe(desactive.id)).toEqual(["reactiver"]);
    expect(actionsDe(sansTotp.id)).toEqual(["desactiver"]);
    expect(vueAdmin.comptes.find((c) => c.id === sansTotp.id)?.doubleAuthConfiguree).toBe(false);
    const invitations = new Map(vueAdmin.invitations.map((i) => [i.id, i]));
    expect(invitations.get(invitationEnseignant.invitationId)?.actions).toEqual(["relancer", "annuler"]);
    expect(invitations.get(invitationAdmin.invitationId)?.actions).toEqual([]);
    expect(invitations.get(invitationAdmin.invitationId)?.expiree).toBe(false);

    const vueSuper = await listerComptes(superAdmin);
    expect(vueSuper.comptes.find((c) => c.id === admin.id)?.actions).toEqual([
      "desactiver",
      "reinitialiser_double_auth",
      "changer_role",
    ]);
    expect(JSON.stringify(vueSuper)).not.toContain("argon2");
  });
});

describe("désactiver et réactiver", () => {
  it("révoque sessions et jetons MCP, conserve le compte, puis le réactive", async () => {
    const admin = await acteur("admin");
    const cible = await compte("enseignant");
    const { jeton } = await ouvrirSessionComplete(cible.id);
    await db()
      .insert(jetonMcp)
      .values({
        enseignantId: cible.id,
        nom: "Assistant",
        prefixe: "carreau_ab",
        jetonHash: `mcp-${cible.id}`,
        portee: "ecriture",
        creeLe: new Date(DEBUT),
      });

    await desactiverCompte(admin, { utilisateurId: cible.id });
    expect((await lire(cible.id))?.actif).toBe(false);
    expect(await validerJetonSession(jeton)).toBeNull();
    const [mcp] = await db().select().from(jetonMcp).where(eq(jetonMcp.enseignantId, cible.id));
    expect(mcp?.revoqueLe?.getTime()).toBe(DEBUT);
    await expect(
      connecter({ email: cible.email, motDePasse: MOT_DE_PASSE_TEST, resterConnecte: false, ip: "10.0.0.1" }),
    ).rejects.toMatchObject({
      code: "NON_CONNECTE",
    });
    await expect(desactiverCompte(admin, { utilisateurId: cible.id })).rejects.toMatchObject({
      code: "ETAT",
    });

    await reactiverCompte(admin, { utilisateurId: cible.id });
    expect((await lire(cible.id))?.actif).toBe(true);
    await expect(reactiverCompte(admin, { utilisateurId: cible.id })).rejects.toMatchObject({ code: "ETAT" });
    const actions = (
      await db()
        .select()
        .from(journal)
        .where(eq(journal.cible, `utilisateur:${cible.id}`))
    ).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["comptes.desactiver", "comptes.reactiver"]));
  });

  it("refuse d'agir sur son propre compte, sur un compte inconnu ou un identifiant invalide", async () => {
    const superAdmin = await acteur("super_admin");
    await expect(desactiverCompte(superAdmin, { utilisateurId: superAdmin.id })).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGE_PROPRE_COMPTE,
    });
    await expect(
      desactiverCompte(superAdmin, { utilisateurId: "11111111-1111-4111-8111-111111111111" }),
    ).rejects.toMatchObject({ code: "INTROUVABLE" });
    await expect(desactiverCompte(superAdmin, { utilisateurId: "x" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});

describe("réinitialiser la double authentification", () => {
  it("efface le secret, révoque les sessions et impose un nouvel enrôlement", async () => {
    const admin = await acteur("admin");
    const cible = await compte("enseignant");
    const { jeton } = await ouvrirSessionComplete(cible.id);
    await reinitialiserDoubleAuth(admin, { utilisateurId: cible.id });

    const apres = await lire(cible.id);
    expect(apres?.totpSecretChiffre).toBeNull();
    expect(apres?.totpDernierPas).toBeNull();
    expect(await validerJetonSession(jeton)).toBeNull();
    const attente = await connecter({
      email: cible.email,
      motDePasse: MOT_DE_PASSE_TEST,
      resterConnecte: false,
      ip: "10.0.0.2",
    });
    expect((await preparerDoubleAuth(attente.jeton))?.mode).toBe("enrolement");
    await expect(reinitialiserDoubleAuth(admin, { utilisateurId: cible.id })).rejects.toMatchObject({
      code: "ETAT",
    });
  });
});

describe("changer le rôle", () => {
  it("change le rôle et le journalise avec l'ancien et le nouveau", async () => {
    const superAdmin = await acteur("super_admin");
    const cible = await compte("enseignant");
    await changerRole(superAdmin, { utilisateurId: cible.id, role: "super_admin" });
    expect((await lire(cible.id))?.role).toBe("super_admin");
    const [entree] = await db()
      .select()
      .from(journal)
      .where(and(eq(journal.action, "comptes.changer_role"), eq(journal.cible, `utilisateur:${cible.id}`)));
    expect(entree?.details).toEqual({ avant: "enseignant", apres: "super_admin" });
    await expect(
      changerRole(superAdmin, { utilisateurId: cible.id, role: "super_admin" }),
    ).rejects.toMatchObject({
      code: "ETAT",
    });
    await expect(changerRole(superAdmin, { utilisateurId: cible.id, role: "root" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});

describe("au moins un super-admin actif", () => {
  it("deux super-admins qui se désactivent en même temps : un seul y parvient", async () => {
    const a = await acteur("super_admin");
    const b = await acteur("super_admin");
    const resultats = await Promise.allSettled([
      desactiverCompte(a, { utilisateurId: b.id }),
      desactiverCompte(b, { utilisateurId: a.id }),
    ]);
    expect(resultats.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejet = resultats.find((r) => r.status === "rejected");
    expect(rejet?.status === "rejected" ? rejet.reason : null).toMatchObject({ code: "ACCES_REFUSE" });
    const actifs = [await lire(a.id), await lire(b.id)].filter((u) => u?.actif);
    expect(actifs).toHaveLength(1);
  });

  it("un super-admin désactivé entre-temps ne peut plus rien faire", async () => {
    const a = await acteur("super_admin");
    const b = await acteur("super_admin");
    await desactiverCompte(a, { utilisateurId: b.id });
    const cible = await compte("enseignant");
    await expect(desactiverCompte(b, { utilisateurId: cible.id })).rejects.toMatchObject({
      code: "ACCES_REFUSE",
    });
  });
});

describe("jetons MCP à la réinitialisation de la double authentification (amendement A1 du plan du lot 8)", () => {
  it("révoque les jetons MCP actifs du compte", async () => {
    const admin = await acteur("admin");
    const cible = await compte("enseignant");
    const j = await creerJetonMcpTest(cible.id);
    await reinitialiserDoubleAuth(admin, { utilisateurId: cible.id });
    const [ligne] = await db().select().from(jetonMcp).where(eq(jetonMcp.id, j.id));
    expect(ligne?.revoqueLe?.getTime()).toBe(DEBUT);
  });
});
