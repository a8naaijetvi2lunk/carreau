/**
 * Envoi des emails (spec §9.3) : configuration lue dans les paramètres, 3 envois par heure et
 * par destinataire, erreurs Resend journalisées (sans adresse) et renvoyées sous forme
 * affichable. N'échoue pas par exception pour un envoi refusé : l'appelant décide de montrer
 * l'échec (invitation, test) ou de le taire (mot de passe oublié).
 */
import "server-only";
import { z } from "zod";
import { exigerRole, type ActeurUtilisateur } from "@/lib/acteur";
import { env } from "@/lib/env";
import { ErreurService, erreurDepuisZod } from "@/lib/erreurs";
import { maintenant } from "@/lib/horloge";
import { sha256Hex } from "@/lib/jetons";
import { journaliser } from "@/modules/journal";
import { reserverJournalise, type RegleLimite } from "@/modules/limiteur";
import { lireConfigurationEnvoi } from "@/modules/parametres";
import { MODELES_TEST, modeleTest, type MessageEmail } from "./modeles";
import { transportEmail } from "./transport";

export const REGLE_EMAIL_DESTINATAIRE: RegleLimite = {
  seuil: 3,
  fenetreSecondes: 3600,
  blocageSecondes: 3600,
};

export function cleEmailDestinataire(email: string): string {
  return `email:destinataire:${sha256Hex(email.trim().toLowerCase())}`;
}

export const MESSAGE_ENVOI_NON_CONFIGURE =
  "L'envoi des emails n'est pas configuré : renseigne la clé Resend dans Paramètres.";
export const MESSAGE_LIMITE_DESTINATAIRE =
  "Trois emails sont déjà partis vers cette adresse dans l'heure : réessaie plus tard.";

export type ResultatEnvoi = { ok: true } | { ok: false; message: string };

export type DemandeEnvoi = { destinataire: string; modele: string; message: MessageEmail };

export async function envoyerEmail(demande: DemandeEnvoi): Promise<ResultatEnvoi> {
  const configuration = await lireConfigurationEnvoi();
  if (!configuration) return { ok: false, message: MESSAGE_ENVOI_NON_CONFIGURE };
  try {
    await reserverJournalise(cleEmailDestinataire(demande.destinataire), REGLE_EMAIL_DESTINATAIRE, {
      action: "emails.limite",
    });
  } catch (erreur) {
    if (erreur instanceof ErreurService && erreur.code === "LIMITE_ATTEINTE") {
      return { ok: false, message: MESSAGE_LIMITE_DESTINATAIRE };
    }
    throw erreur;
  }
  const resultat = await transportEmail()({
    cleApi: configuration.cleApi,
    expediteur: configuration.expediteur,
    destinataire: demande.destinataire,
    sujet: demande.message.sujet,
    texte: demande.message.texte,
    html: demande.message.html,
  });
  if (!resultat.ok) {
    await journaliser({
      acteur: { type: "systeme" },
      action: "emails.echec",
      details: { modele: demande.modele, erreur: resultat.nom, statut: resultat.statut },
    });
    return { ok: false, message: `L'email n'a pas pu partir (Resend : ${resultat.message}).` };
  }
  return { ok: true };
}

const schemaTest = z.strictObject({ modele: z.enum(MODELES_TEST, { error: "Modèle d'email inconnu." }) });

/** Envoi de test (super-admin), toujours vers l'adresse de l'acteur (décision D12 du plan). */
export async function envoyerEmailTest(
  acteur: ActeurUtilisateur,
  saisie: { modele: string },
): Promise<ResultatEnvoi> {
  exigerRole(acteur, ["super_admin"]);
  const resultat = schemaTest.safeParse(saisie);
  if (!resultat.success) throw erreurDepuisZod(resultat.error, "Email de test");
  const { modele } = resultat.data;
  const lien = new URL("/connexion", env().APP_URL).toString();
  const envoi = await envoyerEmail({
    destinataire: acteur.email,
    modele: `test_${modele}`,
    message: modeleTest(modele, lien, maintenant()),
  });
  await journaliser({
    acteur: { type: "utilisateur", id: acteur.id },
    action: "parametres.email_test",
    details: { modele, ok: envoi.ok },
  });
  return envoi;
}
