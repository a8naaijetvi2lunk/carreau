/**
 * Mot de passe oublié (spec §5, décision D9 du plan du lot 1) : lien d'une heure, usage unique,
 * qui révoque toutes les sessions ; le TOTP est conservé. La demande répond toujours de la même
 * façon : ni l'existence du compte, ni la limite, ni un échec d'envoi ne sont révélés.
 */
import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { jetonReinitialisation, utilisateur } from "@/db/schema";
import { env } from "@/lib/env";
import { erreurDepuisZod, erreurs } from "@/lib/erreurs";
import { maintenant } from "@/lib/horloge";
import { FORMAT_JETON, genererJeton, sha256Hex } from "@/lib/jetons";
import { schemaEmail, schemaIp, schemaJeton, schemaNouveauMotDePasse } from "@/lib/saisies";
import { cleConnexionCompte, hacherMotDePasse, supprimerSessionsUtilisateur } from "@/modules/auth";
import { envoyerEmail, modeleReinitialisation } from "@/modules/emails";
import { journaliser } from "@/modules/journal";
import { effacer, reserverJournalise, type RegleLimite } from "@/modules/limiteur";

export const DUREE_REINITIALISATION_MS = 60 * 60 * 1000;

/** Demandes par IP : large, une salle partage une IP ; la limite par destinataire (3/h) s'ajoute. */
export const REGLE_REINITIALISATION_IP: RegleLimite = {
  seuil: 30,
  fenetreSecondes: 3600,
  blocageSecondes: 3600,
};

export function cleReinitialisationIp(ip: string): string {
  return `reinitialisation:ip:${ip}`;
}

export function lienReinitialisation(jeton: string): string {
  return new URL(`/reinitialisation/${jeton}`, env().APP_URL).toString();
}

export type EtatLienReinitialisation = "valide" | "expire" | "utilise";

export const MESSAGES_REINITIALISATION: Record<Exclude<EtatLienReinitialisation, "valide">, string> = {
  expire: "Ce lien a expiré : fais une nouvelle demande de réinitialisation.",
  utilise: "Ce lien a déjà servi : fais une nouvelle demande si besoin.",
};

type LigneJeton = typeof jetonReinitialisation.$inferSelect;

const schemaDemande = z.strictObject({ email: schemaEmail, ip: schemaIp });
const schemaReinitialisation = z.strictObject({ jeton: schemaJeton, motDePasse: schemaNouveauMotDePasse });

function etatLien(ligne: LigneJeton, instant: Date): EtatLienReinitialisation {
  if (ligne.utiliseLe) return "utilise";
  if (ligne.expireLe.getTime() <= instant.getTime()) return "expire";
  return "valide";
}

export async function demanderReinitialisation(saisie: { email: string; ip: string }): Promise<void> {
  const resultat = schemaDemande.safeParse(saisie);
  if (!resultat.success) throw erreurDepuisZod(resultat.error, "Mot de passe oublié");
  const { email, ip } = resultat.data;
  await reserverJournalise(cleReinitialisationIp(ip), REGLE_REINITIALISATION_IP, {
    action: "comptes.limite_reinitialisation",
  });

  const [compte] = await db()
    .select({ id: utilisateur.id, actif: utilisateur.actif })
    .from(utilisateur)
    .where(eq(utilisateur.email, email))
    .limit(1);
  if (!compte?.actif) return;

  const jeton = genererJeton();
  const instant = maintenant();
  const expireLe = new Date(instant.getTime() + DUREE_REINITIALISATION_MS);
  await db().transaction(async (tx) => {
    await tx
      .delete(jetonReinitialisation)
      .where(
        and(eq(jetonReinitialisation.utilisateurId, compte.id), isNull(jetonReinitialisation.utiliseLe)),
      );
    await tx
      .insert(jetonReinitialisation)
      .values({ utilisateurId: compte.id, jetonHash: sha256Hex(jeton), creeLe: instant, expireLe });
    await journaliser(
      {
        acteur: { type: "anonyme" },
        action: "comptes.demander_reinitialisation",
        cible: `utilisateur:${compte.id}`,
      },
      tx,
    );
  });
  // Échec d'envoi ou limite par destinataire : journalisés par envoyerEmail, jamais révélés.
  await envoyerEmail({
    destinataire: email,
    modele: "reinitialisation",
    message: modeleReinitialisation({ lien: lienReinitialisation(jeton), expireLe }),
  });
}

/** État d'un lien (page de réinitialisation), null pour un lien inconnu ou un compte désactivé. */
export async function lireLienReinitialisation(jeton: string): Promise<EtatLienReinitialisation | null> {
  if (!FORMAT_JETON.test(jeton)) return null;
  const [ligne] = await db()
    .select({ jeton: jetonReinitialisation, actif: utilisateur.actif })
    .from(jetonReinitialisation)
    .innerJoin(utilisateur, eq(jetonReinitialisation.utilisateurId, utilisateur.id))
    .where(eq(jetonReinitialisation.jetonHash, sha256Hex(jeton)))
    .limit(1);
  if (!ligne?.actif) return null;
  return etatLien(ligne.jeton, maintenant());
}

function exigerValide(ligne: LigneJeton | undefined, instant: Date): LigneJeton {
  if (!ligne) throw erreurs.introuvable("Lien");
  const etat = etatLien(ligne, instant);
  if (etat !== "valide") throw erreurs.etat(MESSAGES_REINITIALISATION[etat], { raison: etat });
  return ligne;
}

export async function reinitialiserMotDePasse(saisie: { jeton: string; motDePasse: string }): Promise<void> {
  const resultat = schemaReinitialisation.safeParse(saisie);
  if (!resultat.success) throw erreurDepuisZod(resultat.error, "Réinitialisation");
  const jetonHash = sha256Hex(resultat.data.jeton);

  // Contrôle sans verrou d'abord : un lien invalide ne coûte aucun hachage argon2.
  const [avant] = await db()
    .select()
    .from(jetonReinitialisation)
    .where(eq(jetonReinitialisation.jetonHash, jetonHash))
    .limit(1);
  exigerValide(avant, maintenant());
  const motDePasseHash = await hacherMotDePasse(resultat.data.motDePasse);

  const email = await db().transaction(async (tx) => {
    const instant = maintenant();
    const [verrouille] = await tx
      .select()
      .from(jetonReinitialisation)
      .where(eq(jetonReinitialisation.jetonHash, jetonHash))
      .for("update");
    const ligne = exigerValide(verrouille, instant);
    const [compte] = await tx
      .update(utilisateur)
      .set({ motDePasseHash })
      .where(and(eq(utilisateur.id, ligne.utilisateurId), eq(utilisateur.actif, true)))
      .returning({ id: utilisateur.id, email: utilisateur.email });
    if (!compte) throw erreurs.introuvable("Compte");
    await tx
      .update(jetonReinitialisation)
      .set({ utiliseLe: instant })
      .where(eq(jetonReinitialisation.id, ligne.id));
    await tx
      .delete(jetonReinitialisation)
      .where(
        and(eq(jetonReinitialisation.utilisateurId, compte.id), isNull(jetonReinitialisation.utiliseLe)),
      );
    await supprimerSessionsUtilisateur(compte.id, tx);
    await journaliser(
      {
        acteur: { type: "utilisateur", id: compte.id },
        action: "comptes.reinitialiser_mot_de_passe",
        cible: `utilisateur:${compte.id}`,
      },
      tx,
    );
    return compte.email;
  });
  // Le lien prouve la possession de l'adresse : le compteur de connexion repart de zéro.
  await effacer([cleConnexionCompte(email)]);
}
