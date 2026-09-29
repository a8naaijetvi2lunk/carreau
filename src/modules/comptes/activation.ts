/**
 * Activation d'un compte (spec §5) : l'invité choisit nom, prénom et mot de passe ; le compte est
 * créé, l'invitation consommée, et une session en attente mène à l'enrôlement du TOTP.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { invitation, utilisateur } from "@/db/schema";
import { erreurDepuisZod, erreurs } from "@/lib/erreurs";
import { estViolationUnicite } from "@/lib/erreurs-sql";
import { maintenant } from "@/lib/horloge";
import { sha256Hex } from "@/lib/jetons";
import { schemaJeton, schemaNom, schemaNouveauMotDePasse, schemaPrenom } from "@/lib/saisies";
import { hacherMotDePasse, ouvrirSessionEnAttente, type SessionOuverte } from "@/modules/auth";
import { journaliser } from "@/modules/journal";
import { etatInvitation, type EtatInvitation } from "./invitations";

export const MESSAGES_INVITATION: Record<Exclude<EtatInvitation, "valide">, string> = {
  expiree: "Ce lien d'invitation a expiré : demande une nouvelle invitation à l'administration de Carreau.",
  utilisee: "Ce lien a déjà servi : connecte-toi avec ton adresse email et ton mot de passe.",
  annulee: "Ce lien n'est plus valable : une invitation plus récente t'a peut-être été envoyée.",
};

const schemaActivation = z.strictObject({
  jeton: schemaJeton,
  nom: schemaNom,
  prenom: schemaPrenom,
  motDePasse: schemaNouveauMotDePasse,
});

function exigerUtilisable(
  ligne: typeof invitation.$inferSelect | undefined,
  instant: Date,
): typeof invitation.$inferSelect {
  if (!ligne) throw erreurs.introuvable("Invitation");
  const etat = etatInvitation(ligne, instant);
  if (etat !== "valide") throw erreurs.etat(MESSAGES_INVITATION[etat], { raison: etat });
  return ligne;
}

export async function activerCompte(saisie: {
  jeton: string;
  nom: string;
  prenom: string;
  motDePasse: string;
}): Promise<SessionOuverte> {
  const resultat = schemaActivation.safeParse(saisie);
  if (!resultat.success) throw erreurDepuisZod(resultat.error, "Activation");
  const { jeton, nom, prenom, motDePasse } = resultat.data;
  const jetonHash = sha256Hex(jeton);

  // Contrôle sans verrou d'abord : un lien invalide ne coûte aucun hachage argon2.
  const [avant] = await db().select().from(invitation).where(eq(invitation.jetonHash, jetonHash)).limit(1);
  exigerUtilisable(avant, maintenant());
  const motDePasseHash = await hacherMotDePasse(motDePasse);

  try {
    return await db().transaction(async (tx) => {
      const instant = maintenant();
      const [verrouillee] = await tx
        .select()
        .from(invitation)
        .where(eq(invitation.jetonHash, jetonHash))
        .for("update");
      const ligne = exigerUtilisable(verrouillee, instant);
      const [compte] = await tx
        .insert(utilisateur)
        .values({
          email: ligne.email,
          nom,
          prenom,
          role: ligne.role,
          motDePasseHash,
          actif: true,
          creeLe: instant,
        })
        .returning({ id: utilisateur.id });
      if (!compte) throw new Error("Compte non créé");
      await tx.update(invitation).set({ utiliseeLe: instant }).where(eq(invitation.id, ligne.id));
      await journaliser(
        {
          acteur: { type: "utilisateur", id: compte.id },
          action: "comptes.activer",
          cible: `utilisateur:${compte.id}`,
          details: { role: ligne.role, invitation: ligne.id },
        },
        tx,
      );
      return ouvrirSessionEnAttente(compte.id, false, tx);
    });
  } catch (erreur) {
    if (estViolationUnicite(erreur, "utilisateur_email_unique")) {
      throw erreurs.conflit("Un compte existe déjà pour cette adresse : connecte-toi.");
    }
    throw erreur;
  }
}
