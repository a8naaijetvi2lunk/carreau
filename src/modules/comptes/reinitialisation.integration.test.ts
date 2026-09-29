import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { jetonReinitialisation, journal, limiteur, utilisateur } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { cleConnexionCompte, connecter, REGLE_CONNEXION_COMPTE, validerJetonSession } from "@/modules/auth";
import {
  cleReinitialisationIp,
  demanderReinitialisation,
  DUREE_REINITIALISATION_MS,
  lireLienReinitialisation,
  MESSAGES_REINITIALISATION,
  REGLE_REINITIALISATION_IP,
  reinitialiserMotDePasse,
} from "@/modules/comptes";
import {
  cleEmailDestinataire,
  definirTransportEmailPourLesTests,
  REGLE_EMAIL_DESTINATAIRE,
} from "@/modules/emails";
import { reserver } from "@/modules/limiteur";
import { creerUtilisateur, MOT_DE_PASSE_TEST, ouvrirSessionComplete } from "@/test/comptes";
import { capturerEmails, configurerEnvoi, jetonDuLien } from "@/test/emails";

const DEBUT = Date.parse("2026-09-29T08:00:00.000Z");
const NOUVEAU = "un tout nouveau mot de passe";
let horloge: ReturnType<typeof horlogeFixe>;
let ip = 0;

beforeEach(async () => {
  horloge = horlogeFixe(DEBUT);
  definirHorlogePourLesTests(horloge);
  await configurerEnvoi();
  // Transport capturé dès la configuration : aucun test ne peut atteindre le vrai Resend
  // (l'afterEach d'un autre fichier peut avoir laissé le transport réel actif).
  capturerEmails();
});
afterEach(() => {
  definirHorlogePourLesTests();
  definirTransportEmailPourLesTests();
});

/** Une IP par demande : la limite par IP n'interfère pas entre les tests. */
function nouvelleIp(): string {
  ip += 1;
  return `192.0.2.${ip}`;
}

async function demander(email: string) {
  const envois = capturerEmails();
  await demanderReinitialisation({ email, ip: nouvelleIp() });
  return envois;
}

describe("demanderReinitialisation", () => {
  it("envoie un lien d'une heure à un compte actif et journalise la demande", async () => {
    const u = await creerUtilisateur();
    const envois = await demander(u.email.toUpperCase());
    expect(envois).toHaveLength(1);
    expect(envois[0]?.destinataire).toBe(u.email);
    expect(envois[0]?.sujet).toBe("Réinitialisation de votre mot de passe Carreau");
    const jeton = jetonDuLien(envois[0], "reinitialisation");
    expect(await lireLienReinitialisation(jeton)).toBe("valide");
    const [ligne] = await db()
      .select()
      .from(jetonReinitialisation)
      .where(eq(jetonReinitialisation.utilisateurId, u.id));
    expect(ligne?.expireLe.getTime()).toBe(DEBUT + DUREE_REINITIALISATION_MS);
    const [entree] = await db()
      .select()
      .from(journal)
      .where(eq(journal.action, "comptes.demander_reinitialisation"));
    expect(entree).toMatchObject({ acteurType: "anonyme", cible: `utilisateur:${u.id}` });
  });

  it("répond de la même façon sans rien envoyer pour une adresse inconnue ou un compte désactivé", async () => {
    const desactive = await creerUtilisateur({ actif: false });
    expect(await demander("inconnu@exemple.fr")).toEqual([]);
    expect(await demander(desactive.email)).toEqual([]);
  });

  it("une nouvelle demande remplace le lien précédent", async () => {
    const u = await creerUtilisateur();
    const premier = jetonDuLien((await demander(u.email))[0], "reinitialisation");
    const second = jetonDuLien((await demander(u.email))[0], "reinitialisation");
    expect(await lireLienReinitialisation(premier)).toBeNull();
    expect(await lireLienReinitialisation(second)).toBe("valide");
  });

  it("tait la limite par destinataire", async () => {
    const u = await creerUtilisateur();
    for (let i = 0; i < REGLE_EMAIL_DESTINATAIRE.seuil; i++) {
      await reserver(cleEmailDestinataire(u.email), REGLE_EMAIL_DESTINATAIRE);
    }
    expect(await demander(u.email)).toEqual([]);
  });

  it("limite les demandes par IP", async () => {
    const adresse = "192.0.2.250";
    for (let i = 0; i < REGLE_REINITIALISATION_IP.seuil; i++) {
      await reserver(cleReinitialisationIp(adresse), REGLE_REINITIALISATION_IP);
    }
    await expect(demanderReinitialisation({ email: "x@exemple.fr", ip: adresse })).rejects.toMatchObject({
      code: "LIMITE_ATTEINTE",
    });
  });
});

describe("reinitialiserMotDePasse", () => {
  it("change le mot de passe, révoque les sessions, garde le TOTP et débloque la connexion", async () => {
    const u = await creerUtilisateur();
    const { jeton: session } = await ouvrirSessionComplete(u.id);
    for (let i = 0; i < REGLE_CONNEXION_COMPTE.seuil; i++) {
      await reserver(cleConnexionCompte(u.email), REGLE_CONNEXION_COMPTE);
    }
    const lien = jetonDuLien((await demander(u.email))[0], "reinitialisation");

    await reinitialiserMotDePasse({ jeton: lien, motDePasse: NOUVEAU });

    expect(await validerJetonSession(session)).toBeNull();
    const [apres] = await db().select().from(utilisateur).where(eq(utilisateur.id, u.id));
    expect(apres?.totpSecretChiffre).toBe(u.totpSecretChiffre);
    expect(await lireLienReinitialisation(lien)).toBe("utilise");
    expect(
      await db()
        .select()
        .from(limiteur)
        .where(eq(limiteur.cle, cleConnexionCompte(u.email))),
    ).toEqual([]);
    await expect(
      connecter({ email: u.email, motDePasse: MOT_DE_PASSE_TEST, resterConnecte: false, ip: "10.0.0.3" }),
    ).rejects.toMatchObject({ code: "NON_CONNECTE" });
    expect(
      (await connecter({ email: u.email, motDePasse: NOUVEAU, resterConnecte: false, ip: "10.0.0.3" })).jeton,
    ).toBeTruthy();
    const [entree] = await db()
      .select()
      .from(journal)
      .where(eq(journal.action, "comptes.reinitialiser_mot_de_passe"));
    expect(entree).toMatchObject({ acteurId: u.id, cible: `utilisateur:${u.id}` });
  });

  it("refuse un lien expiré, déjà utilisé, inconnu, ou un mot de passe trop court", async () => {
    const u = await creerUtilisateur();
    const lien = jetonDuLien((await demander(u.email))[0], "reinitialisation");
    await expect(reinitialiserMotDePasse({ jeton: lien, motDePasse: "court" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    horloge.avancer(DUREE_REINITIALISATION_MS);
    expect(await lireLienReinitialisation(lien)).toBe("expire");
    await expect(reinitialiserMotDePasse({ jeton: lien, motDePasse: NOUVEAU })).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_REINITIALISATION.expire,
    });
    horloge.fixer(DEBUT);

    const autre = jetonDuLien((await demander(u.email))[0], "reinitialisation");
    await reinitialiserMotDePasse({ jeton: autre, motDePasse: NOUVEAU });
    await expect(reinitialiserMotDePasse({ jeton: autre, motDePasse: NOUVEAU })).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_REINITIALISATION.utilise,
    });
    await expect(
      reinitialiserMotDePasse({ jeton: "A".repeat(43), motDePasse: NOUVEAU }),
    ).rejects.toMatchObject({
      code: "INTROUVABLE",
    });
    expect(await lireLienReinitialisation("court")).toBeNull();
  });
});
