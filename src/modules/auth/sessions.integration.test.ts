import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { sessionConnexion, utilisateur } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { sha256Hex } from "@/lib/jetons";
import {
  DUREE_DOUBLE_AUTH_MS,
  DUREE_INACTIVITE_MS,
  DUREE_SESSION_LONGUE_MS,
  DUREE_SESSION_MS,
  enregistrerSecretEnAttente,
  lireSessionEnAttente,
  ouvrirSessionEnAttente,
  supprimerSession,
  supprimerSessionEnAttente,
  supprimerSessionsUtilisateur,
  validerJetonSession,
  validerSession,
} from "@/modules/auth";
import { creerUtilisateur, exiger, ouvrirSessionComplete } from "@/test/comptes";

const DEBUT = Date.parse("2026-09-29T08:00:00.000Z");
let horloge: ReturnType<typeof horlogeFixe>;

beforeEach(() => {
  horloge = horlogeFixe(DEBUT);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

async function sessionsDe(utilisateurId: string) {
  return db().select().from(sessionConnexion).where(eq(sessionConnexion.utilisateurId, utilisateurId));
}

describe("session en attente de double authentification", () => {
  it("dure 10 minutes, ne stocke que l'empreinte du jeton et n'ouvre aucune page", async () => {
    const u = await creerUtilisateur();
    const { jeton, expireLe, resterConnecte } = await ouvrirSessionEnAttente(u.id, true);
    expect(expireLe.getTime()).toBe(DEBUT + DUREE_DOUBLE_AUTH_MS);
    expect(resterConnecte).toBe(true);
    const [ligne] = await sessionsDe(u.id);
    expect(ligne?.jetonHash).toBe(sha256Hex(jeton));
    expect(await validerJetonSession(jeton)).toBeNull();
    expect(await lireSessionEnAttente(jeton)).toEqual({
      sessionId: ligne?.id,
      utilisateurId: u.id,
      email: u.email,
      resterConnecte: true,
      totpSecretChiffre: u.totpSecretChiffre,
      totpEnAttenteChiffre: null,
    });
    horloge.avancer(DUREE_DOUBLE_AUTH_MS);
    expect(await lireSessionEnAttente(jeton)).toBeNull();
  });

  it("refuse un jeton mal formé ou inconnu, et un compte désactivé", async () => {
    expect(await lireSessionEnAttente("court")).toBeNull();
    expect(await lireSessionEnAttente("A".repeat(43))).toBeNull();
    const u = await creerUtilisateur({ actif: false });
    const { jeton } = await ouvrirSessionEnAttente(u.id, false);
    expect(await lireSessionEnAttente(jeton)).toBeNull();
  });

  it("garde le premier secret d'enrôlement enregistré", async () => {
    const u = await creerUtilisateur({ totp: false });
    const { jeton } = await ouvrirSessionEnAttente(u.id, false);
    const session = exiger(await lireSessionEnAttente(jeton));
    expect(await enregistrerSecretEnAttente(session.sessionId, "v1.premier")).toBe("v1.premier");
    expect(await enregistrerSecretEnAttente(session.sessionId, "v1.second")).toBe("v1.premier");
    expect((await lireSessionEnAttente(jeton))?.totpEnAttenteChiffre).toBe("v1.premier");
  });

  it("s'abandonne : la session en attente est supprimée", async () => {
    const u = await creerUtilisateur();
    const { jeton } = await ouvrirSessionEnAttente(u.id, false);
    await supprimerSessionEnAttente("court");
    await supprimerSessionEnAttente(jeton);
    expect(await sessionsDe(u.id)).toEqual([]);
  });
});

describe("validation de la session", () => {
  it("change le jeton, efface le secret d'enrôlement et ouvre 12 h", async () => {
    const u = await creerUtilisateur({ role: "admin" });
    const attente = await ouvrirSessionEnAttente(u.id, false);
    const session = exiger(await lireSessionEnAttente(attente.jeton));
    await enregistrerSecretEnAttente(session.sessionId, "v1.secret");

    const ouverte = exiger(await validerSession(session.sessionId, false));
    expect(ouverte.jeton).not.toBe(attente.jeton);
    expect(ouverte.expireLe.getTime()).toBe(DEBUT + DUREE_SESSION_MS);
    expect(await validerJetonSession(attente.jeton)).toBeNull();
    expect(await validerJetonSession(ouverte.jeton)).toEqual({
      type: "utilisateur",
      id: u.id,
      sessionId: session.sessionId,
      email: u.email,
      nom: u.nom,
      prenom: u.prenom,
      role: "admin",
    });
    const [ligne] = await sessionsDe(u.id);
    expect(ligne?.totpEnAttenteChiffre).toBeNull();
    expect(await validerSession(session.sessionId, false)).toBeNull();
  });

  it("« Rester connecté » : 30 jours, sans limite d'inactivité", async () => {
    const u = await creerUtilisateur();
    const { jeton } = await ouvrirSessionComplete(u.id, true);
    const [ligne] = await sessionsDe(u.id);
    expect(ligne?.expireLe.getTime()).toBe(DEBUT + DUREE_SESSION_LONGUE_MS);
    horloge.avancer(10 * 24 * 60 * 60 * 1000);
    expect(await validerJetonSession(jeton)).not.toBeNull();
    horloge.avancer(20 * 24 * 60 * 60 * 1000);
    expect(await validerJetonSession(jeton)).toBeNull();
  });
});

describe("validité d'une session complète", () => {
  it("ferme et supprime une session inactive depuis plus de 30 minutes", async () => {
    const u = await creerUtilisateur();
    const { jeton } = await ouvrirSessionComplete(u.id);
    horloge.avancer(DUREE_INACTIVITE_MS);
    expect(await validerJetonSession(jeton)).not.toBeNull();
    horloge.avancer(DUREE_INACTIVITE_MS + 1);
    expect(await validerJetonSession(jeton)).toBeNull();
    expect(await sessionsDe(u.id)).toEqual([]);
  });

  it("n'écrit l'activité qu'une fois par minute", async () => {
    const u = await creerUtilisateur();
    const { jeton } = await ouvrirSessionComplete(u.id);
    horloge.avancer(30_000);
    await validerJetonSession(jeton);
    expect((await sessionsDe(u.id))[0]?.derniereActiviteLe.getTime()).toBe(DEBUT);
    horloge.avancer(31_000);
    await validerJetonSession(jeton);
    expect((await sessionsDe(u.id))[0]?.derniereActiviteLe.getTime()).toBe(DEBUT + 61_000);
  });

  it("expire au bout de 12 heures, même active", async () => {
    const u = await creerUtilisateur();
    const { jeton } = await ouvrirSessionComplete(u.id);
    for (let i = 0; i < 24; i++) {
      horloge.avancer(29 * 60 * 1000);
      expect(await validerJetonSession(jeton)).not.toBeNull();
    }
    horloge.avancer(25 * 60 * 1000);
    expect(await validerJetonSession(jeton)).toBeNull();
  });

  it("refuse la session d'un compte désactivé", async () => {
    const u = await creerUtilisateur();
    const { jeton } = await ouvrirSessionComplete(u.id);
    await db().update(utilisateur).set({ actif: false }).where(eq(utilisateur.id, u.id));
    expect(await validerJetonSession(jeton)).toBeNull();
  });

  it("supprime une session, ou toutes celles d'un compte", async () => {
    const u = await creerUtilisateur();
    const a = await ouvrirSessionComplete(u.id);
    const b = await ouvrirSessionComplete(u.id);
    await supprimerSession(a.sessionId);
    expect(await validerJetonSession(a.jeton)).toBeNull();
    expect(await validerJetonSession(b.jeton)).not.toBeNull();
    await supprimerSessionsUtilisateur(u.id);
    expect(await sessionsDe(u.id)).toEqual([]);
  });
});
