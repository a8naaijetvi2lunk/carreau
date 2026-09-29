/**
 * Connexion en deux temps (spec §5, décisions D2, D8 et D10 du plan du lot 1) : l'adresse et le
 * mot de passe ouvrent une session en attente ; le code TOTP (ou l'enrôlement d'un premier
 * secret) la valide. Message d'échec unique, temps de réponse homogène, anti-rejeu.
 */
import "server-only";
import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { utilisateur } from "@/db/schema";
import { referenceErreur } from "@/lib/action";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { erreurDepuisZod, erreurs } from "@/lib/erreurs";
import { maintenant } from "@/lib/horloge";
import { journaliserErreurInattendue } from "@/lib/journal-erreur";
import { schemaCodeTotp, schemaEmail, schemaIp, schemaMotDePasseSaisi } from "@/lib/saisies";
import { journaliser } from "@/modules/journal";
import { effacer, reserverJournalise } from "@/modules/limiteur";
import {
  cleConnexionCompte,
  cleConnexionIp,
  cleDoubleAuth,
  REGLE_CONNEXION_COMPTE,
  REGLE_CONNEXION_IP,
  REGLE_DOUBLE_AUTH,
} from "./cles";
import { verifierMotDePasse, verifierMotDePasseFactice } from "./hachage";
import {
  enregistrerSecretEnAttente,
  lireSessionEnAttente,
  ouvrirSessionEnAttente,
  supprimerSession,
  validerSession,
  type SessionOuverte,
} from "./sessions";
import {
  chiffrerSecretTotp,
  cleManuelle,
  dechiffrerSecretTotp,
  genererSecretTotp,
  pasDuCode,
  qrCodeTotp,
  uriTotp,
} from "./totp";

export const MESSAGE_IDENTIFIANTS = "Adresse email ou mot de passe incorrect.";
export const MESSAGE_CODE_INCORRECT =
  "Code incorrect. Vérifie l'heure de ton téléphone et saisis le code affiché.";
export const MESSAGE_SESSION_EXPIREE = "La connexion a expiré : recommence depuis le début.";
export const MESSAGE_TOTP_INUTILISABLE =
  "La double authentification de ce compte est inutilisable : demande à un administrateur de la réinitialiser.";

const schemaConnexion = z.strictObject({
  email: schemaEmail,
  motDePasse: schemaMotDePasseSaisi,
  resterConnecte: z.boolean({ error: "Indique s'il faut rester connecté." }),
  ip: schemaIp,
});

const schemaDoubleAuth = z.strictObject({
  jetonSession: z.string({ error: MESSAGE_SESSION_EXPIREE }).max(200, { error: MESSAGE_SESSION_EXPIREE }),
  code: schemaCodeTotp,
});

/**
 * Adresse et mot de passe : ouvre une session en attente de double authentification.
 * Compteur par adresse (connue ou non) et, pour une adresse sans compte, par IP ; argon2 factice
 * pour une adresse sans compte ; même message pour tout échec (inconnu, faux, désactivé).
 */
export async function connecter(saisie: {
  email: string;
  motDePasse: string;
  resterConnecte: boolean;
  ip: string;
}): Promise<SessionOuverte> {
  const resultat = schemaConnexion.safeParse(saisie);
  if (!resultat.success) throw erreurDepuisZod(resultat.error, "Connexion");
  const { email, motDePasse, resterConnecte, ip } = resultat.data;

  const [compte] = await db().select().from(utilisateur).where(eq(utilisateur.email, email)).limit(1);
  const cible = compte ? `utilisateur:${compte.id}` : undefined;
  await reserverJournalise(cleConnexionCompte(email), REGLE_CONNEXION_COMPTE, {
    action: "auth.limite_connexion",
    cible,
  });
  if (!compte)
    await reserverJournalise(cleConnexionIp(ip), REGLE_CONNEXION_IP, { action: "auth.limite_connexion" });

  const motDePasseJuste = compte
    ? await verifierMotDePasse(compte.motDePasseHash, motDePasse)
    : await verifierMotDePasseFactice(motDePasse);
  if (!compte || !motDePasseJuste || !compte.actif) {
    const motif = !compte
      ? "compte inconnu"
      : !motDePasseJuste
        ? "mot de passe incorrect"
        : "compte désactivé";
    await journaliser({
      acteur: { type: "anonyme" },
      action: "auth.connexion_echec",
      cible,
      details: { motif },
    });
    throw erreurs.nonConnecte(MESSAGE_IDENTIFIANTS);
  }

  await effacer([cleConnexionCompte(email)]);
  return ouvrirSessionEnAttente(compte.id, resterConnecte);
}

export type EcranDoubleAuth =
  | { mode: "code"; email: string }
  | { mode: "enrolement"; email: string; uri: string; cleManuelle: string; qrCode: string };

/**
 * Données de l'écran de double authentification, ou null sans session en attente valide.
 * Compte sans TOTP : tire le secret à enrôler, une seule fois par session.
 */
export async function preparerDoubleAuth(jetonSession: string): Promise<EcranDoubleAuth | null> {
  const session = await lireSessionEnAttente(jetonSession);
  if (!session) return null;
  if (session.totpSecretChiffre) return { mode: "code", email: session.email };
  const secretChiffre =
    session.totpEnAttenteChiffre ??
    (await enregistrerSecretEnAttente(session.sessionId, chiffrerSecretTotp(genererSecretTotp())));
  const uri = uriTotp(dechiffrerSecretTotp(secretChiffre), session.email);
  return {
    mode: "enrolement",
    email: session.email,
    uri,
    cleManuelle: cleManuelle(uri),
    qrCode: await qrCodeTotp(uri),
  };
}

/**
 * Anti-rejeu atomique : retient `pas` comme dernier pas accepté s'il est plus récent que le
 * précédent. Enrôlement (`secretEnrole` non nul) : enregistre aussi le secret, si aucun ne l'a
 * été entre-temps. Faux si le code est rejoué ou la course perdue.
 */
async function consommerPas(
  utilisateurId: string,
  pas: number,
  secretEnrole: string | null,
): Promise<boolean> {
  const lignes = await db()
    .update(utilisateur)
    .set(secretEnrole ? { totpDernierPas: pas, totpSecretChiffre: secretEnrole } : { totpDernierPas: pas })
    .where(
      and(
        eq(utilisateur.id, utilisateurId),
        or(isNull(utilisateur.totpDernierPas), lt(utilisateur.totpDernierPas, pas)),
        secretEnrole ? isNull(utilisateur.totpSecretChiffre) : isNotNull(utilisateur.totpSecretChiffre),
      ),
    )
    .returning({ id: utilisateur.id });
  return lignes.length === 1;
}

/** Code TOTP : valide la session en attente (nouveau jeton) et renvoie la session complète. */
export async function validerDoubleAuth(saisie: {
  jetonSession: string;
  code: string;
}): Promise<SessionOuverte> {
  const resultat = schemaDoubleAuth.safeParse(saisie);
  if (!resultat.success) throw erreurDepuisZod(resultat.error, "Double authentification");
  const session = await lireSessionEnAttente(resultat.data.jetonSession);
  if (!session) throw erreurs.nonConnecte(MESSAGE_SESSION_EXPIREE);

  const cible = `utilisateur:${session.utilisateurId}`;
  const cle = cleDoubleAuth(session.utilisateurId);
  await reserverJournalise(cle, REGLE_DOUBLE_AUTH, { action: "auth.limite_double_auth", cible });

  const enrolement = session.totpSecretChiffre === null;
  const secretChiffre = session.totpSecretChiffre ?? session.totpEnAttenteChiffre;
  if (!secretChiffre) throw erreurs.nonConnecte(MESSAGE_SESSION_EXPIREE);
  let secret: Uint8Array;
  try {
    secret = dechiffrerSecretTotp(secretChiffre);
  } catch (erreur) {
    journaliserErreurInattendue("auth", referenceErreur(), erreur);
    throw erreurs.etat(MESSAGE_TOTP_INUTILISABLE);
  }

  const instant = maintenant();
  const pas = pasDuCode(secret, resultat.data.code, instant);
  const accepte =
    pas !== null && (await consommerPas(session.utilisateurId, pas, enrolement ? secretChiffre : null));
  if (!accepte) {
    await journaliser({
      acteur: { type: "anonyme" },
      action: "auth.double_auth_echec",
      cible,
      details: { motif: pas === null ? "code incorrect" : "code déjà utilisé" },
    });
    throw erreurs.validation(MESSAGE_CODE_INCORRECT, [{ chemin: "code", message: MESSAGE_CODE_INCORRECT }]);
  }

  await effacer([cle]);
  return db().transaction(async (tx) => {
    const ouverte = await validerSession(session.sessionId, session.resterConnecte, tx);
    if (!ouverte) throw erreurs.nonConnecte(MESSAGE_SESSION_EXPIREE);
    await tx
      .update(utilisateur)
      .set({ derniereConnexionLe: instant })
      .where(eq(utilisateur.id, session.utilisateurId));
    await journaliser(
      {
        acteur: { type: "utilisateur", id: session.utilisateurId },
        action: "auth.connexion",
        cible,
        details: { enrolement, resterConnecte: session.resterConnecte },
      },
      tx,
    );
    return ouverte;
  });
}

export async function deconnecter(acteur: ActeurUtilisateur): Promise<void> {
  await supprimerSession(acteur.sessionId);
  await journaliser({ acteur: { type: "utilisateur", id: acteur.id }, action: "auth.deconnexion" });
}
