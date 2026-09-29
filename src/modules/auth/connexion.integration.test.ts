import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { journal, limiteur, sessionConnexion, utilisateur } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import {
  cleConnexionCompte,
  cleConnexionIp,
  connecter,
  dechiffrerSecretTotp,
  deconnecter,
  DUREE_DOUBLE_AUTH_MS,
  DUREE_SESSION_LONGUE_MS,
  lireSessionEnAttente,
  MESSAGE_CODE_INCORRECT,
  MESSAGE_IDENTIFIANTS,
  MESSAGE_SESSION_EXPIREE,
  MESSAGE_TOTP_INUTILISABLE,
  pasTotp,
  preparerDoubleAuth,
  REGLE_CONNEXION_IP,
  validerDoubleAuth,
  validerJetonSession,
} from "@/modules/auth";
import { reserver } from "@/modules/limiteur";
import { codeTotpTest, creerUtilisateur, exiger, MOT_DE_PASSE_TEST } from "@/test/comptes";

const DEBUT = Date.parse("2026-09-29T08:00:10.000Z");
const IP = "203.0.113.7";
let horloge: ReturnType<typeof horlogeFixe>;

beforeEach(() => {
  horloge = horlogeFixe(DEBUT);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => {
  definirHorlogePourLesTests();
  vi.restoreAllMocks();
});

function saisie(email: string, motDePasse = MOT_DE_PASSE_TEST, resterConnecte = false, ip = IP) {
  return { email, motDePasse, resterConnecte, ip };
}

async function journalDe(action: string, cible?: string) {
  const lignes = await db().select().from(journal).where(eq(journal.action, action));
  return cible === undefined ? lignes : lignes.filter((l) => l.cible === cible);
}

describe("mot de passe", () => {
  it("ouvre une session en attente (adresse normalisée) et remet le compteur à zéro", async () => {
    const u = await creerUtilisateur({ email: "claire@exemple.fr" });
    await expect(connecter(saisie("claire@exemple.fr", "faux mot de passe"))).rejects.toMatchObject({
      code: "NON_CONNECTE",
    });
    const session = await connecter(saisie("  Claire@Exemple.FR ", MOT_DE_PASSE_TEST, true));
    expect(session.expireLe.getTime()).toBe(DEBUT + DUREE_DOUBLE_AUTH_MS);
    expect(session.resterConnecte).toBe(true);
    expect((await lireSessionEnAttente(session.jeton))?.utilisateurId).toBe(u.id);
    expect(await validerJetonSession(session.jeton)).toBeNull();
    expect(
      await db()
        .select()
        .from(limiteur)
        .where(eq(limiteur.cle, cleConnexionCompte("claire@exemple.fr"))),
    ).toEqual([]);
  });

  it.each([
    ["mot de passe incorrect", true, "autre mot de passe"],
    ["compte désactivé", false, MOT_DE_PASSE_TEST],
  ] as const)("%s : message unique, échec journalisé sans l'adresse", async (motif, actif, motDePasse) => {
    const u = await creerUtilisateur({ actif });
    await expect(connecter(saisie(u.email, motDePasse))).rejects.toMatchObject({
      code: "NON_CONNECTE",
      message: MESSAGE_IDENTIFIANTS,
    });
    const lignes = await journalDe("auth.connexion_echec", `utilisateur:${u.id}`);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ acteurType: "anonyme", details: { motif } });
    expect(JSON.stringify(lignes)).not.toContain(u.email);
  });

  it("adresse sans compte : même message, journalisé sans l'adresse", async () => {
    await expect(connecter(saisie("inconnu@exemple.fr"))).rejects.toMatchObject({
      code: "NON_CONNECTE",
      message: MESSAGE_IDENTIFIANTS,
    });
    const lignes = await journalDe("auth.connexion_echec");
    expect(
      lignes.some((l) => l.cible === null && (l.details as { motif?: string }).motif === "compte inconnu"),
    ).toBe(true);
    expect(JSON.stringify(lignes)).not.toContain("inconnu@exemple.fr");
  });

  it("bloque le compte après 5 échecs en 15 minutes, même avec le bon mot de passe", async () => {
    const u = await creerUtilisateur();
    for (let i = 0; i < 5; i++) {
      await expect(connecter(saisie(u.email, "faux mot de passe"))).rejects.toMatchObject({
        code: "NON_CONNECTE",
      });
    }
    await expect(connecter(saisie(u.email))).rejects.toMatchObject({ code: "LIMITE_ATTEINTE" });
    expect(await journalDe("auth.limite_connexion", `utilisateur:${u.id}`)).toHaveLength(1);
    horloge.avancer(15 * 60 * 1000);
    expect((await connecter(saisie(u.email))).jeton).toBeTruthy();
  });

  it("bloque l'IP après 100 échecs sur des adresses sans compte, jamais un compte réel", async () => {
    const ip = "198.51.100.9";
    for (let i = 0; i < REGLE_CONNEXION_IP.seuil; i++) await reserver(cleConnexionIp(ip), REGLE_CONNEXION_IP);
    await expect(connecter(saisie("personne@exemple.fr", "x", false, ip))).rejects.toMatchObject({
      code: "LIMITE_ATTEINTE",
    });
    const u = await creerUtilisateur();
    expect((await connecter(saisie(u.email, MOT_DE_PASSE_TEST, false, ip))).jeton).toBeTruthy();
  });

  it("refuse une saisie invalide", async () => {
    await expect(
      connecter({ email: "pas-une-adresse", motDePasse: "", resterConnecte: false, ip: IP }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("double authentification", () => {
  it("valide le code : nouveau jeton, dernière connexion, pas consommé, journal", async () => {
    const u = await creerUtilisateur();
    const attente = await connecter(saisie(u.email));
    expect(await preparerDoubleAuth(attente.jeton)).toEqual({ mode: "code", email: u.email });

    const ouverte = await validerDoubleAuth({
      jetonSession: attente.jeton,
      code: codeTotpTest(new Date(DEBUT)),
    });
    expect(ouverte.jeton).not.toBe(attente.jeton);
    expect((await validerJetonSession(ouverte.jeton))?.id).toBe(u.id);
    expect(await validerJetonSession(attente.jeton)).toBeNull();
    const [apres] = await db().select().from(utilisateur).where(eq(utilisateur.id, u.id));
    expect(apres?.derniereConnexionLe?.getTime()).toBe(DEBUT);
    expect(apres?.totpDernierPas).toBe(pasTotp(new Date(DEBUT)));
    const [ligne] = await journalDe("auth.connexion", `utilisateur:${u.id}`);
    expect(ligne).toMatchObject({
      acteurType: "utilisateur",
      acteurId: u.id,
      details: { enrolement: false, resterConnecte: false },
    });
  });

  it("« Rester connecté » ouvre une session de 30 jours", async () => {
    const u = await creerUtilisateur();
    const attente = await connecter(saisie(u.email, MOT_DE_PASSE_TEST, true));
    const ouverte = await validerDoubleAuth({
      jetonSession: attente.jeton,
      code: codeTotpTest(new Date(DEBUT)),
    });
    expect(ouverte.expireLe.getTime()).toBe(DEBUT + DUREE_SESSION_LONGUE_MS);
    expect(ouverte.resterConnecte).toBe(true);
  });

  it("refuse un code faux ou rejoué avec le même message, puis accepte le code suivant", async () => {
    const u = await creerUtilisateur();
    const code = codeTotpTest(new Date(DEBUT));
    const a = await connecter(saisie(u.email));
    await expect(
      validerDoubleAuth({ jetonSession: a.jeton, code: codeTotpTest(new Date(DEBUT), 10) }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      message: MESSAGE_CODE_INCORRECT,
    });
    await validerDoubleAuth({ jetonSession: a.jeton, code });

    const b = await connecter(saisie(u.email));
    await expect(validerDoubleAuth({ jetonSession: b.jeton, code })).rejects.toMatchObject({
      code: "VALIDATION",
      message: MESSAGE_CODE_INCORRECT,
    });
    const motifs = (await journalDe("auth.double_auth_echec", `utilisateur:${u.id}`)).map(
      (l) => (l.details as { motif: string }).motif,
    );
    expect(motifs).toEqual(["code incorrect", "code déjà utilisé"]);
    expect(
      (await validerDoubleAuth({ jetonSession: b.jeton, code: codeTotpTest(new Date(DEBUT), 1) })).jeton,
    ).toBeTruthy();
  });

  it("bloque après 5 codes faux en 15 minutes", async () => {
    const u = await creerUtilisateur();
    const a = await connecter(saisie(u.email));
    for (let i = 0; i < 5; i++) {
      await expect(
        validerDoubleAuth({ jetonSession: a.jeton, code: codeTotpTest(new Date(DEBUT), 10) }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    }
    await expect(
      validerDoubleAuth({ jetonSession: a.jeton, code: codeTotpTest(new Date(DEBUT)) }),
    ).rejects.toMatchObject({ code: "LIMITE_ATTEINTE" });
    expect(await journalDe("auth.limite_double_auth", `utilisateur:${u.id}`)).toHaveLength(1);
  });

  it("refuse une session en attente expirée, absente ou invalide", async () => {
    const u = await creerUtilisateur();
    const a = await connecter(saisie(u.email));
    horloge.avancer(DUREE_DOUBLE_AUTH_MS);
    expect(await preparerDoubleAuth(a.jeton)).toBeNull();
    await expect(
      validerDoubleAuth({ jetonSession: a.jeton, code: codeTotpTest(new Date(DEBUT)) }),
    ).rejects.toMatchObject({
      code: "NON_CONNECTE",
      message: MESSAGE_SESSION_EXPIREE,
    });
    await expect(validerDoubleAuth({ jetonSession: "", code: "123456" })).rejects.toMatchObject({
      code: "NON_CONNECTE",
    });
  });

  it("secret illisible : état explicite, incident journalisé côté serveur", async () => {
    const u = await creerUtilisateur();
    await db()
      .update(utilisateur)
      .set({ totpSecretChiffre: "v1.abc.def.ghi" })
      .where(eq(utilisateur.id, u.id));
    const espion = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const a = await connecter(saisie(u.email));
    await expect(validerDoubleAuth({ jetonSession: a.jeton, code: "123456" })).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGE_TOTP_INUTILISABLE,
    });
    expect(espion).toHaveBeenCalledTimes(1);
  });
});

describe("enrôlement du TOTP", () => {
  it("tire un secret une fois par session, puis l'enregistre au premier code valide", async () => {
    const u = await creerUtilisateur({ totp: false });
    const a = await connecter(saisie(u.email));
    const ecran = exiger(await preparerDoubleAuth(a.jeton));
    if (ecran.mode !== "enrolement") throw new Error("écran d'enrôlement attendu");
    expect(ecran.email).toBe(u.email);
    expect(ecran.uri.startsWith("otpauth://totp/")).toBe(true);
    expect(ecran.cleManuelle).toMatch(/^([A-Z2-7]{4} ){7}[A-Z2-7]{4}$/);
    expect(ecran.qrCode.startsWith("data:image/svg+xml")).toBe(true);
    expect(await preparerDoubleAuth(a.jeton)).toEqual(ecran);

    const session = exiger(await lireSessionEnAttente(a.jeton));
    const secretChiffre = exiger(session.totpEnAttenteChiffre);
    const secret = dechiffrerSecretTotp(secretChiffre);
    await expect(
      validerDoubleAuth({ jetonSession: a.jeton, code: codeTotpTest(new Date(DEBUT), 10, secret) }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const [avant] = await db().select().from(utilisateur).where(eq(utilisateur.id, u.id));
    expect(avant?.totpSecretChiffre).toBeNull();

    await validerDoubleAuth({ jetonSession: a.jeton, code: codeTotpTest(new Date(DEBUT), 0, secret) });
    const [apres] = await db().select().from(utilisateur).where(eq(utilisateur.id, u.id));
    expect(apres?.totpSecretChiffre).toBe(secretChiffre);
    const [ligne] = await journalDe("auth.connexion", `utilisateur:${u.id}`);
    expect(ligne?.details).toEqual({ enrolement: true, resterConnecte: false });

    const b = await connecter(saisie(u.email));
    expect(await preparerDoubleAuth(b.jeton)).toEqual({ mode: "code", email: u.email });
  });

  it("sans secret tiré (écran jamais affiché), la validation est refusée", async () => {
    const u = await creerUtilisateur({ totp: false });
    const a = await connecter(saisie(u.email));
    await expect(validerDoubleAuth({ jetonSession: a.jeton, code: "123456" })).rejects.toMatchObject({
      code: "NON_CONNECTE",
      message: MESSAGE_SESSION_EXPIREE,
    });
  });
});

describe("déconnexion", () => {
  it("supprime la session et le journalise", async () => {
    const u = await creerUtilisateur();
    const attente = await connecter(saisie(u.email));
    const ouverte = await validerDoubleAuth({
      jetonSession: attente.jeton,
      code: codeTotpTest(new Date(DEBUT)),
    });
    const acteur = exiger(await validerJetonSession(ouverte.jeton));
    await deconnecter(acteur);
    expect(await validerJetonSession(ouverte.jeton)).toBeNull();
    expect(
      await db().select().from(sessionConnexion).where(eq(sessionConnexion.utilisateurId, u.id)),
    ).toEqual([]);
    expect(await journalDe("auth.deconnexion")).toEqual([
      expect.objectContaining({ acteurType: "utilisateur", acteurId: u.id }),
    ]);
  });
});
