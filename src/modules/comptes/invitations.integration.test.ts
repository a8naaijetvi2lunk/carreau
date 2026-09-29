import { and, eq, isNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { invitation, journal, parametres } from "@/db/schema";
import type { Role } from "@/lib/acteur";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { sha256Hex } from "@/lib/jetons";
import {
  annulerInvitation,
  cleInvitationsEmetteur,
  inviter,
  lireInvitation,
  MESSAGE_COMPTE_EXISTANT,
  REGLE_INVITATIONS_EMETTEUR,
  relancerInvitation,
} from "@/modules/comptes";
import { definirTransportEmailPourLesTests, MESSAGE_ENVOI_NON_CONFIGURE } from "@/modules/emails";
import { reserver } from "@/modules/limiteur";
import { acteurDe, creerUtilisateur } from "@/test/comptes";
import { capturerEmails, configurerEnvoi, jetonDuLien } from "@/test/emails";

const DEBUT = Date.parse("2026-09-29T08:00:00.000Z");
const JOUR = 24 * 60 * 60 * 1000;
let horloge: ReturnType<typeof horlogeFixe>;

beforeEach(() => {
  horloge = horlogeFixe(DEBUT);
  definirHorlogePourLesTests(horloge);
});
afterEach(async () => {
  definirHorlogePourLesTests();
  definirTransportEmailPourLesTests();
  // Une base isolée par fichier (pas par test) : sans ce nettoyage, la configuration Resend
  // posée par `configurerEnvoi()` fuit dans les tests suivants (appel réseau réel à Resend).
  await db().delete(parametres).where(eq(parametres.id, 1));
});

async function acteur(role: Role = "admin") {
  return acteurDe(await creerUtilisateur({ role, prenom: "Yves", nom: "Charvis" }));
}

function jetonDe(lien: string): string {
  return lien.slice(lien.lastIndexOf("/") + 1);
}

describe("inviter", () => {
  it("un admin invite un enseignant : lien rendu, email envoyé, invitation journalisée", async () => {
    await configurerEnvoi();
    const envois = capturerEmails();
    const admin = await acteur("admin");
    const emise = await inviter(admin, { email: " Julie.Masson@Exemple.fr ", role: "enseignant" });

    expect(emise.email).toBe("julie.masson@exemple.fr");
    expect(emise.envoi).toEqual({ ok: true });
    expect(emise.expireLe.getTime()).toBe(DEBUT + 7 * JOUR);
    expect(emise.lien).toMatch(/\/activation\/[A-Za-z0-9_-]{43}$/);
    expect(envois).toHaveLength(1);
    expect(envois[0]?.destinataire).toBe("julie.masson@exemple.fr");
    expect(envois[0]?.sujet).toBe("Invitation à rejoindre Carreau");
    expect(envois[0]?.texte).toContain("Yves Charvis vous invite");
    const jeton = jetonDuLien(envois[0], "activation");
    expect(jetonDe(emise.lien)).toBe(jeton);

    const [ligne] = await db().select().from(invitation).where(eq(invitation.id, emise.invitationId));
    expect(ligne).toMatchObject({
      email: "julie.masson@exemple.fr",
      role: "enseignant",
      invitePar: admin.id,
      jetonHash: sha256Hex(jeton),
    });
    expect(await lireInvitation(jeton)).toEqual({
      email: "julie.masson@exemple.fr",
      role: "enseignant",
      etat: "valide",
      expireLe: emise.expireLe,
    });
    const [entree] = await db().select().from(journal).where(eq(journal.action, "comptes.inviter"));
    expect(entree).toMatchObject({
      acteurId: admin.id,
      cible: `invitation:${emise.invitationId}`,
      details: { role: "enseignant" },
    });
  });

  it("rend le lien même quand l'envoi n'est pas configuré", async () => {
    const emise = await inviter(await acteur(), { email: "paul.renaud@exemple.fr", role: "enseignant" });
    expect(emise.envoi).toEqual({ ok: false, message: MESSAGE_ENVOI_NON_CONFIGURE });
    expect(emise.lien).toMatch(/\/activation\/[A-Za-z0-9_-]{43}$/);
  });

  it("applique la validité réglée dans les paramètres", async () => {
    await db()
      .insert(parametres)
      .values({ id: 1, validiteInvitationJours: 3 })
      .onConflictDoUpdate({ target: parametres.id, set: { validiteInvitationJours: 3 } });
    const emise = await inviter(await acteur(), { email: "valide3@exemple.fr", role: "enseignant" });
    expect(emise.expireLe.getTime()).toBe(DEBUT + 3 * JOUR);
    await db().update(parametres).set({ validiteInvitationJours: 7 }).where(eq(parametres.id, 1));
  });

  it("seul le super-admin invite un admin ; personne n'invite un super-admin par l'interface", async () => {
    await expect(
      inviter(await acteur("admin"), { email: "a1@exemple.fr", role: "admin" }),
    ).rejects.toMatchObject({
      code: "ACCES_REFUSE",
    });
    await expect(
      inviter(await acteur("enseignant"), { email: "a2@exemple.fr", role: "enseignant" }),
    ).rejects.toMatchObject({ code: "ACCES_REFUSE" });
    const superAdmin = await acteur("super_admin");
    expect((await inviter(superAdmin, { email: "a3@exemple.fr", role: "admin" })).email).toBe(
      "a3@exemple.fr",
    );
    await expect(inviter(superAdmin, { email: "a4@exemple.fr", role: "super_admin" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("refuse une adresse qui a déjà un compte", async () => {
    await creerUtilisateur({ email: "claire@exemple.fr" });
    await expect(
      inviter(await acteur(), { email: "claire@exemple.fr", role: "enseignant" }),
    ).rejects.toMatchObject({
      code: "CONFLIT",
      message: MESSAGE_COMPTE_EXISTANT,
    });
  });

  it("une nouvelle invitation annule la précédente pour la même adresse", async () => {
    const admin = await acteur();
    const premiere = await inviter(admin, { email: "sophie@exemple.fr", role: "enseignant" });
    const seconde = await inviter(admin, { email: "sophie@exemple.fr", role: "enseignant" });
    expect((await lireInvitation(jetonDe(premiere.lien)))?.etat).toBe("annulee");
    expect((await lireInvitation(jetonDe(seconde.lien)))?.etat).toBe("valide");
    const enAttente = await db()
      .select()
      .from(invitation)
      .where(
        and(
          eq(invitation.email, "sophie@exemple.fr"),
          isNull(invitation.utiliseeLe),
          isNull(invitation.annuleeLe),
        ),
      );
    expect(enAttente).toHaveLength(1);
    const [entreeSeconde] = await db()
      .select()
      .from(journal)
      .where(eq(journal.cible, `invitation:${seconde.invitationId}`));
    expect(entreeSeconde?.details).toEqual({ role: "enseignant", remplace: premiere.invitationId });
  });

  it("un admin ne remplace pas l'invitation d'un admin en attente pour la même adresse", async () => {
    const superAdmin = await acteur("super_admin");
    const admin = await acteur("admin");
    const emiseAdmin = await inviter(superAdmin, { email: "karim.admin@exemple.fr", role: "admin" });
    await expect(
      inviter(admin, { email: "karim.admin@exemple.fr", role: "enseignant" }),
    ).rejects.toMatchObject({ code: "ACCES_REFUSE" });
    expect((await lireInvitation(jetonDe(emiseAdmin.lien)))?.etat).toBe("valide");
  });

  it("le super-admin remplace une invitation admin par une invitation enseignant pour la même adresse", async () => {
    const superAdmin = await acteur("super_admin");
    const emiseAdmin = await inviter(superAdmin, { email: "remplace@exemple.fr", role: "admin" });
    const emiseEnseignant = await inviter(superAdmin, {
      email: "remplace@exemple.fr",
      role: "enseignant",
    });
    expect((await lireInvitation(jetonDe(emiseAdmin.lien)))?.etat).toBe("annulee");
    expect((await lireInvitation(jetonDe(emiseEnseignant.lien)))?.etat).toBe("valide");
  });

  it("limite l'émetteur à 20 invitations par heure", async () => {
    const admin = await acteur();
    for (let i = 0; i < REGLE_INVITATIONS_EMETTEUR.seuil; i++) {
      await reserver(cleInvitationsEmetteur(admin.id), REGLE_INVITATIONS_EMETTEUR);
    }
    await expect(inviter(admin, { email: "trop@exemple.fr", role: "enseignant" })).rejects.toMatchObject({
      code: "LIMITE_ATTEINTE",
    });
    const refus = await db().select().from(journal).where(eq(journal.action, "comptes.limite_invitations"));
    expect(refus.map((l) => l.cible)).toContain(`utilisateur:${admin.id}`);
  });
});

describe("lireInvitation", () => {
  it("donne l'état expirée après la durée de validité", async () => {
    const emise = await inviter(await acteur(), { email: "expire@exemple.fr", role: "enseignant" });
    horloge.avancer(7 * JOUR);
    expect((await lireInvitation(jetonDe(emise.lien)))?.etat).toBe("expiree");
  });

  it("ignore un lien inconnu ou mal formé", async () => {
    expect(await lireInvitation("court")).toBeNull();
    expect(await lireInvitation("A".repeat(43))).toBeNull();
  });
});

describe("relancer et annuler", () => {
  it("relance une invitation expirée : nouveau lien, ancien annulé, email de rappel", async () => {
    await configurerEnvoi();
    const envois = capturerEmails();
    const admin = await acteur();
    const emise = await inviter(admin, { email: "karim@exemple.fr", role: "enseignant" });
    horloge.avancer(8 * JOUR);

    const relance = await relancerInvitation(admin, { invitationId: emise.invitationId });
    expect(relance.invitationId).not.toBe(emise.invitationId);
    expect(relance.expireLe.getTime()).toBe(DEBUT + 15 * JOUR);
    expect((await lireInvitation(jetonDe(emise.lien)))?.etat).toBe("annulee");
    expect((await lireInvitation(jetonDe(relance.lien)))?.etat).toBe("valide");
    expect(envois.at(-1)?.sujet).toBe("Rappel : votre invitation à rejoindre Carreau");
    const [entree] = await db().select().from(journal).where(eq(journal.action, "comptes.relancer"));
    expect(entree?.details).toEqual({ remplace: emise.invitationId });

    await expect(relancerInvitation(admin, { invitationId: emise.invitationId })).rejects.toMatchObject({
      code: "ETAT",
    });
  });

  it("annule une invitation en attente, une seule fois", async () => {
    const admin = await acteur();
    const emise = await inviter(admin, { email: "annule@exemple.fr", role: "enseignant" });
    await annulerInvitation(admin, { invitationId: emise.invitationId });
    expect((await lireInvitation(jetonDe(emise.lien)))?.etat).toBe("annulee");
    await expect(annulerInvitation(admin, { invitationId: emise.invitationId })).rejects.toMatchObject({
      code: "ETAT",
    });
    const [entree] = await db()
      .select()
      .from(journal)
      .where(eq(journal.action, "comptes.annuler_invitation"));
    expect(entree?.cible).toBe(`invitation:${emise.invitationId}`);
  });

  it("l'admin ne touche pas aux invitations d'admins ; identifiant inconnu ou invalide refusé", async () => {
    const superAdmin = await acteur("super_admin");
    const admin = await acteur("admin");
    const emise = await inviter(superAdmin, { email: "futur.admin@exemple.fr", role: "admin" });
    await expect(relancerInvitation(admin, { invitationId: emise.invitationId })).rejects.toMatchObject({
      code: "ACCES_REFUSE",
    });
    await expect(annulerInvitation(admin, { invitationId: emise.invitationId })).rejects.toMatchObject({
      code: "ACCES_REFUSE",
    });
    await expect(
      relancerInvitation(admin, { invitationId: "11111111-1111-4111-8111-111111111111" }),
    ).rejects.toMatchObject({ code: "INTROUVABLE" });
    await expect(annulerInvitation(admin, { invitationId: "x" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});
