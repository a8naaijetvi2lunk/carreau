/**
 * Invitations (spec §5 et §9.2, décisions D3, D6 et D7 du plan du lot 1) : lien à usage unique,
 * jeton haché, validité réglée dans les paramètres. L'admin invite des enseignants, le
 * super-admin aussi des admins. Le lien est rendu à l'inviteur, que l'email parte ou non.
 */
import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, type Transaction } from "@/db";
import { invitation, utilisateur } from "@/db/schema";
import { exigerRole, peutGererRole, type ActeurUtilisateur, type Role } from "@/lib/acteur";
import { env } from "@/lib/env";
import { erreurDepuisZod, erreurs } from "@/lib/erreurs";
import { estViolationUnicite } from "@/lib/erreurs-sql";
import { maintenant } from "@/lib/horloge";
import { FORMAT_JETON, genererJeton, sha256Hex } from "@/lib/jetons";
import { schemaEmail, schemaIdentifiant } from "@/lib/saisies";
import { envoyerEmail, modeleInvitation, type ResultatEnvoi } from "@/modules/emails";
import { journaliser } from "@/modules/journal";
import { reserverJournalise, type RegleLimite } from "@/modules/limiteur";
import { lireValiditeInvitationJours } from "@/modules/parametres";

export const REGLE_INVITATIONS_EMETTEUR: RegleLimite = {
  seuil: 20,
  fenetreSecondes: 3600,
  blocageSecondes: 3600,
};

export function cleInvitationsEmetteur(utilisateurId: string): string {
  return `invitation:emetteur:${utilisateurId}`;
}

export const MESSAGE_COMPTE_EXISTANT = "Un compte existe déjà pour cette adresse.";
export const MESSAGE_INVITATION_NON_EN_ATTENTE = "Cette invitation n'est plus en attente.";

export type InvitationEmise = {
  invitationId: string;
  email: string;
  lien: string;
  expireLe: Date;
  envoi: ResultatEnvoi;
};

export type EtatInvitation = "valide" | "expiree" | "utilisee" | "annulee";

export type InvitationLue = { email: string; role: Role; etat: EtatInvitation; expireLe: Date };

type LigneInvitation = typeof invitation.$inferSelect;

const schemaInviter = z.strictObject({
  email: schemaEmail,
  role: z.enum(["enseignant", "admin"], { error: "Choisis le rôle Enseignant ou Admin." }),
});

const schemaInvitationId = z.strictObject({ invitationId: schemaIdentifiant });

export function lienActivation(jeton: string): string {
  return new URL(`/activation/${jeton}`, env().APP_URL).toString();
}

export function etatInvitation(ligne: LigneInvitation, instant: Date): EtatInvitation {
  if (ligne.utiliseeLe) return "utilisee";
  if (ligne.annuleeLe) return "annulee";
  if (ligne.expireLe.getTime() <= instant.getTime()) return "expiree";
  return "valide";
}

function nomInviteur(acteur: ActeurUtilisateur): string {
  return `${acteur.prenom} ${acteur.nom}`;
}

/**
 * Crée une invitation dans la transaction : refuse une adresse qui a déjà un compte, annule
 * l'invitation en attente de la même adresse (une seule en attente, index partiel).
 */
async function creerInvitation(
  tx: Transaction,
  donnees: { email: string; role: Role; invitePar: string; instant: Date; validiteJours: number },
): Promise<{ id: string; jeton: string; expireLe: Date }> {
  const [compte] = await tx
    .select({ id: utilisateur.id })
    .from(utilisateur)
    .where(eq(utilisateur.email, donnees.email))
    .limit(1);
  if (compte) throw erreurs.conflit(MESSAGE_COMPTE_EXISTANT);
  await tx
    .update(invitation)
    .set({ annuleeLe: donnees.instant })
    .where(
      and(eq(invitation.email, donnees.email), isNull(invitation.utiliseeLe), isNull(invitation.annuleeLe)),
    );
  const jeton = genererJeton();
  const expireLe = new Date(donnees.instant.getTime() + donnees.validiteJours * 24 * 60 * 60 * 1000);
  const [creee] = await tx
    .insert(invitation)
    .values({
      email: donnees.email,
      role: donnees.role,
      jetonHash: sha256Hex(jeton),
      invitePar: donnees.invitePar,
      creeLe: donnees.instant,
      expireLe,
    })
    .returning({ id: invitation.id });
  if (!creee) throw new Error("Invitation non créée");
  return { id: creee.id, jeton, expireLe };
}

/** Deux invitations simultanées pour la même adresse : la seconde perd la course, message clair. */
async function sansDoublon<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (erreur) {
    if (estViolationUnicite(erreur, "invitation_email_en_attente_unique")) {
      throw erreurs.conflit("Une invitation vient d'être envoyée à cette adresse : recharge la liste.");
    }
    throw erreur;
  }
}

async function compterInvitation(acteur: ActeurUtilisateur): Promise<void> {
  await reserverJournalise(cleInvitationsEmetteur(acteur.id), REGLE_INVITATIONS_EMETTEUR, {
    action: "comptes.limite_invitations",
    cible: `utilisateur:${acteur.id}`,
  });
}

export async function inviter(
  acteur: ActeurUtilisateur,
  saisie: { email: string; role: string },
): Promise<InvitationEmise> {
  exigerRole(acteur, ["admin", "super_admin"]);
  const resultat = schemaInviter.safeParse(saisie);
  if (!resultat.success) throw erreurDepuisZod(resultat.error, "Invitation");
  const { email, role } = resultat.data;
  if (!peutGererRole(acteur, role)) throw erreurs.accesRefuse("Seul le super-admin peut inviter un admin.");
  await compterInvitation(acteur);

  const instant = maintenant();
  const validiteJours = await lireValiditeInvitationJours();
  const creee = await sansDoublon(() =>
    db().transaction(async (tx) => {
      const nouvelle = await creerInvitation(tx, {
        email,
        role,
        invitePar: acteur.id,
        instant,
        validiteJours,
      });
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "comptes.inviter",
          cible: `invitation:${nouvelle.id}`,
          details: { role },
        },
        tx,
      );
      return nouvelle;
    }),
  );

  const lien = lienActivation(creee.jeton);
  const envoi = await envoyerEmail({
    destinataire: email,
    modele: "invitation",
    message: modeleInvitation({
      inviteur: nomInviteur(acteur),
      role,
      lien,
      expireLe: creee.expireLe,
      relance: false,
    }),
  });
  return { invitationId: creee.id, email, lien, expireLe: creee.expireLe, envoi };
}

/** Invitation en attente que l'acteur peut gérer, verrouillée dans la transaction. */
async function invitationGerable(
  tx: Transaction,
  acteur: ActeurUtilisateur,
  invitationId: string,
): Promise<LigneInvitation> {
  const [ligne] = await tx.select().from(invitation).where(eq(invitation.id, invitationId)).for("update");
  if (!ligne) throw erreurs.introuvable("Invitation");
  if (!peutGererRole(acteur, ligne.role)) throw erreurs.accesRefuse();
  if (ligne.utiliseeLe || ligne.annuleeLe) throw erreurs.etat(MESSAGE_INVITATION_NON_EN_ATTENTE);
  return ligne;
}

/** « Relancer » : révoque l'ancien lien et en émet un nouveau (spec §5), même expirée. */
export async function relancerInvitation(
  acteur: ActeurUtilisateur,
  saisie: { invitationId: string },
): Promise<InvitationEmise> {
  exigerRole(acteur, ["admin", "super_admin"]);
  const resultat = schemaInvitationId.safeParse(saisie);
  if (!resultat.success) throw erreurDepuisZod(resultat.error, "Invitation");
  await compterInvitation(acteur);

  const instant = maintenant();
  const validiteJours = await lireValiditeInvitationJours();
  const { ancienne, nouvelle } = await sansDoublon(() =>
    db().transaction(async (tx) => {
      const ancienne = await invitationGerable(tx, acteur, resultat.data.invitationId);
      const nouvelle = await creerInvitation(tx, {
        email: ancienne.email,
        role: ancienne.role,
        invitePar: acteur.id,
        instant,
        validiteJours,
      });
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "comptes.relancer",
          cible: `invitation:${nouvelle.id}`,
          details: { remplace: ancienne.id },
        },
        tx,
      );
      return { ancienne, nouvelle };
    }),
  );

  const lien = lienActivation(nouvelle.jeton);
  const envoi = await envoyerEmail({
    destinataire: ancienne.email,
    modele: "relance",
    message: modeleInvitation({
      inviteur: nomInviteur(acteur),
      role: ancienne.role,
      lien,
      expireLe: nouvelle.expireLe,
      relance: true,
    }),
  });
  return { invitationId: nouvelle.id, email: ancienne.email, lien, expireLe: nouvelle.expireLe, envoi };
}

export async function annulerInvitation(
  acteur: ActeurUtilisateur,
  saisie: { invitationId: string },
): Promise<void> {
  exigerRole(acteur, ["admin", "super_admin"]);
  const resultat = schemaInvitationId.safeParse(saisie);
  if (!resultat.success) throw erreurDepuisZod(resultat.error, "Invitation");
  await db().transaction(async (tx) => {
    const ligne = await invitationGerable(tx, acteur, resultat.data.invitationId);
    await tx.update(invitation).set({ annuleeLe: maintenant() }).where(eq(invitation.id, ligne.id));
    await journaliser(
      {
        acteur: { type: "utilisateur", id: acteur.id },
        action: "comptes.annuler_invitation",
        cible: `invitation:${ligne.id}`,
      },
      tx,
    );
  });
}

/** Invitation désignée par un lien (page d'activation), ou null pour un lien inconnu. */
export async function lireInvitation(jeton: string): Promise<InvitationLue | null> {
  if (!FORMAT_JETON.test(jeton)) return null;
  const [ligne] = await db()
    .select()
    .from(invitation)
    .where(eq(invitation.jetonHash, sha256Hex(jeton)))
    .limit(1);
  if (!ligne) return null;
  return {
    email: ligne.email,
    role: ligne.role,
    etat: etatInvitation(ligne, maintenant()),
    expireLe: ligne.expireLe,
  };
}
