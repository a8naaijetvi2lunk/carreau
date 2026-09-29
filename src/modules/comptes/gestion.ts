/**
 * Gestion des comptes (spec §5 et §9.2, décision D7 du plan du lot 1) : liste, désactivation,
 * réactivation, réinitialisation du TOTP, changement de rôle. L'admin n'agit que sur les
 * enseignants ; le super-admin sur tous et seul change les rôles ; jamais sur son propre compte.
 * Il reste toujours au moins un super-admin actif.
 */
import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, type Transaction } from "@/db";
import { invitation, jetonMcp, utilisateur } from "@/db/schema";
import { exigerRole, peutGererRole, type ActeurUtilisateur, type Role } from "@/lib/acteur";
import { erreurDepuisZod, erreurs } from "@/lib/erreurs";
import { maintenant } from "@/lib/horloge";
import { schemaIdentifiant, schemaRole } from "@/lib/saisies";
import { supprimerSessionsUtilisateur } from "@/modules/auth";
import { journaliser, journaliserLesRefus } from "@/modules/journal";

export type ActionCompte = "desactiver" | "reactiver" | "reinitialiser_double_auth" | "changer_role";
export type ActionInvitation = "relancer" | "annuler";

export type LigneCompte = {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  role: Role;
  actif: boolean;
  doubleAuthConfiguree: boolean;
  derniereConnexionLe: Date | null;
  estActeur: boolean;
  actions: ActionCompte[];
};

export type LigneInvitationEnAttente = {
  id: string;
  email: string;
  role: Role;
  creeLe: Date;
  expireLe: Date;
  expiree: boolean;
  actions: ActionInvitation[];
};

export const MESSAGE_PROPRE_COMPTE = "Tu ne peux pas faire cette action sur ton propre compte.";

type Cible = { id: string; role: Role; actif: boolean; totpSecretChiffre: string | null };

const schemaCible = z.strictObject({ utilisateurId: schemaIdentifiant });
const schemaChangementRole = z.strictObject({ utilisateurId: schemaIdentifiant, role: schemaRole });

function actionsPossibles(acteur: ActeurUtilisateur, cible: Cible): ActionCompte[] {
  if (cible.id === acteur.id || !peutGererRole(acteur, cible.role)) return [];
  const actions: ActionCompte[] = cible.actif ? ["desactiver"] : ["reactiver"];
  if (cible.actif && cible.totpSecretChiffre !== null) actions.push("reinitialiser_double_auth");
  if (acteur.role === "super_admin") actions.push("changer_role");
  return actions;
}

export async function listerComptes(
  acteur: ActeurUtilisateur,
): Promise<{ comptes: LigneCompte[]; invitations: LigneInvitationEnAttente[] }> {
  return journaliserLesRefus(acteur, "comptes.lister", async () => {
    exigerRole(acteur, ["admin", "super_admin"]);
    const instant = maintenant();
    const comptes = await db()
      .select({
        id: utilisateur.id,
        email: utilisateur.email,
        nom: utilisateur.nom,
        prenom: utilisateur.prenom,
        role: utilisateur.role,
        actif: utilisateur.actif,
        totpSecretChiffre: utilisateur.totpSecretChiffre,
        derniereConnexionLe: utilisateur.derniereConnexionLe,
      })
      .from(utilisateur)
      .orderBy(asc(utilisateur.nom), asc(utilisateur.prenom));
    const invitations = await db()
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        creeLe: invitation.creeLe,
        expireLe: invitation.expireLe,
      })
      .from(invitation)
      .where(and(isNull(invitation.utiliseeLe), isNull(invitation.annuleeLe)))
      .orderBy(desc(invitation.creeLe));

    return {
      comptes: comptes.map((c) => ({
        id: c.id,
        email: c.email,
        nom: c.nom,
        prenom: c.prenom,
        role: c.role,
        actif: c.actif,
        doubleAuthConfiguree: c.totpSecretChiffre !== null,
        derniereConnexionLe: c.derniereConnexionLe,
        estActeur: c.id === acteur.id,
        actions: actionsPossibles(acteur, c),
      })),
      invitations: invitations.map((i) => ({
        ...i,
        expiree: i.expireLe.getTime() <= instant.getTime(),
        actions: peutGererRole(acteur, i.role) ? ["relancer", "annuler"] : [],
      })),
    };
  });
}

/**
 * Transaction de gestion : quand l'acteur est super-admin, verrouille d'abord les super-admins
 * actifs (ordre stable) et vérifie qu'il en fait toujours partie ; puis verrouille la cible et
 * contrôle les droits. Deux super-admins qui se désactivent en même temps sont ainsi
 * sérialisés : le second est refusé.
 */
async function gerer(
  acteur: ActeurUtilisateur,
  utilisateurId: string,
  action: (tx: Transaction, cible: Cible) => Promise<void>,
): Promise<void> {
  await db().transaction(async (tx) => {
    if (acteur.role === "super_admin") {
      const actifs = await tx
        .select({ id: utilisateur.id })
        .from(utilisateur)
        .where(and(eq(utilisateur.role, "super_admin"), eq(utilisateur.actif, true)))
        .orderBy(asc(utilisateur.id))
        .for("update");
      if (!actifs.some((u) => u.id === acteur.id)) throw erreurs.accesRefuse();
    }
    const [cible] = await tx
      .select({
        id: utilisateur.id,
        role: utilisateur.role,
        actif: utilisateur.actif,
        totpSecretChiffre: utilisateur.totpSecretChiffre,
      })
      .from(utilisateur)
      .where(eq(utilisateur.id, utilisateurId))
      .for("update");
    if (!cible) throw erreurs.introuvable("Compte");
    if (cible.id === acteur.id) throw erreurs.etat(MESSAGE_PROPRE_COMPTE);
    if (!peutGererRole(acteur, cible.role)) throw erreurs.accesRefuse();
    await action(tx, cible);
  });
}

function lireCible(saisie: { utilisateurId: string }): string {
  const resultat = schemaCible.safeParse(saisie);
  if (!resultat.success) throw erreurDepuisZod(resultat.error, "Compte");
  return resultat.data.utilisateurId;
}

/** Désactivation : sessions et jetons MCP révoqués sur le champ, données conservées (spec §5). */
export async function desactiverCompte(
  acteur: ActeurUtilisateur,
  saisie: { utilisateurId: string },
): Promise<void> {
  return journaliserLesRefus(acteur, "comptes.desactiver", async () => {
    exigerRole(acteur, ["admin", "super_admin"]);
    await gerer(acteur, lireCible(saisie), async (tx, cible) => {
      if (!cible.actif) throw erreurs.etat("Ce compte est déjà désactivé.");
      await tx.update(utilisateur).set({ actif: false }).where(eq(utilisateur.id, cible.id));
      await supprimerSessionsUtilisateur(cible.id, tx);
      await tx
        .update(jetonMcp)
        .set({ revoqueLe: maintenant() })
        .where(and(eq(jetonMcp.enseignantId, cible.id), isNull(jetonMcp.revoqueLe)));
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "comptes.desactiver",
          cible: `utilisateur:${cible.id}`,
        },
        tx,
      );
    });
  });
}

export async function reactiverCompte(
  acteur: ActeurUtilisateur,
  saisie: { utilisateurId: string },
): Promise<void> {
  return journaliserLesRefus(acteur, "comptes.reactiver", async () => {
    exigerRole(acteur, ["admin", "super_admin"]);
    await gerer(acteur, lireCible(saisie), async (tx, cible) => {
      if (cible.actif) throw erreurs.etat("Ce compte est déjà actif.");
      await tx.update(utilisateur).set({ actif: true }).where(eq(utilisateur.id, cible.id));
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "comptes.reactiver",
          cible: `utilisateur:${cible.id}`,
        },
        tx,
      );
    });
  });
}

/** TOTP réinitialisé : sessions révoquées, nouvel enrôlement à la prochaine connexion (spec §9.2). */
export async function reinitialiserDoubleAuth(
  acteur: ActeurUtilisateur,
  saisie: { utilisateurId: string },
): Promise<void> {
  return journaliserLesRefus(acteur, "comptes.reinitialiser_double_auth", async () => {
    exigerRole(acteur, ["admin", "super_admin"]);
    await gerer(acteur, lireCible(saisie), async (tx, cible) => {
      if (cible.totpSecretChiffre === null) {
        throw erreurs.etat("La double authentification de ce compte est déjà à configurer.");
      }
      await tx
        .update(utilisateur)
        .set({ totpSecretChiffre: null, totpDernierPas: null })
        .where(eq(utilisateur.id, cible.id));
      await supprimerSessionsUtilisateur(cible.id, tx);
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "comptes.reinitialiser_double_auth",
          cible: `utilisateur:${cible.id}`,
        },
        tx,
      );
    });
  });
}

/** Changement de rôle, réservé au super-admin (spec §9.2). */
export async function changerRole(
  acteur: ActeurUtilisateur,
  saisie: { utilisateurId: string; role: string },
): Promise<void> {
  return journaliserLesRefus(acteur, "comptes.changer_role", async () => {
    exigerRole(acteur, ["super_admin"]);
    const resultat = schemaChangementRole.safeParse(saisie);
    if (!resultat.success) throw erreurDepuisZod(resultat.error, "Rôle");
    const { utilisateurId, role } = resultat.data;
    await gerer(acteur, utilisateurId, async (tx, cible) => {
      if (cible.role === role) throw erreurs.etat("Ce compte a déjà ce rôle.");
      await tx.update(utilisateur).set({ role }).where(eq(utilisateur.id, cible.id));
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "comptes.changer_role",
          cible: `utilisateur:${cible.id}`,
          details: { avant: cible.role, apres: role },
        },
        tx,
      );
    });
  });
}
