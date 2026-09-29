/**
 * Paramètres de l'installation (spec §9.3 et §9.4), réservés au super-admin : envoi des emails
 * (clé Resend chiffrée, jamais réaffichée ni journalisée), validité des invitations,
 * conservation des données. Une seule ligne (id = 1), créée à la première écriture.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, type Executeur } from "@/db";
import { parametres } from "@/db/schema";
import { referenceErreur } from "@/lib/action";
import { exigerRole, type ActeurUtilisateur } from "@/lib/acteur";
import { chiffrer, dechiffrer } from "@/lib/chiffrement";
import { erreurDepuisZod, erreurs } from "@/lib/erreurs";
import { maintenant } from "@/lib/horloge";
import { journaliserErreurInattendue } from "@/lib/journal-erreur";
import { schemaEmail } from "@/lib/saisies";
import type { InformationDonnees } from "@/lib/vue-entree";
import { journaliser, journaliserLesRefus } from "@/modules/journal";

export const VALIDITE_INVITATION_DEFAUT_JOURS = 7;

type LigneParametres = typeof parametres.$inferSelect;

export type VueParametres = {
  resendConfiguree: boolean;
  emailExpediteur: string | null;
  nomExpediteur: string | null;
  validiteInvitationJours: number;
  conservationEvenementsJours: number | null;
  conservationResultatsJours: number | null;
  contactDonnees: string | null;
  rgpdComplet: boolean;
};

export type ConfigurationEnvoi = { cleApi: string; expediteur: string };

const FORMAT_CLE_RESEND = /^re_[A-Za-z0-9_-]{8,200}$/;
/** Nom d'expéditeur placé entre guillemets dans l'en-tête `From` : ni guillemet, ni chevron. */
const NOM_EXPEDITEUR_SUR = /^[^<>"\\\p{Cc}]+$/u;
const SANS_CARACTERE_DE_CONTROLE = /^[^\p{Cc}]+$/u;

const MESSAGE_CLE = "La clé Resend commence par re_ et ne contient ni espace ni caractère spécial.";
const MESSAGE_VALIDITE = "Choisis une validité de 1 à 30 jours.";
const MESSAGE_DUREE = "Indique une durée entière de 1 à 3650 jours.";

const schemaEnvoi = z.strictObject({
  cleApi: z
    .string({ error: MESSAGE_CLE })
    .trim()
    .refine((valeur) => valeur === "" || FORMAT_CLE_RESEND.test(valeur), { error: MESSAGE_CLE }),
  emailExpediteur: schemaEmail,
  nomExpediteur: z
    .string({ error: "Le nom affiché est obligatoire." })
    .trim()
    .min(1, { error: "Le nom affiché est obligatoire." })
    .max(100, { error: "Le nom affiché est trop long." })
    .regex(NOM_EXPEDITEUR_SUR, {
      error: "Le nom affiché ne doit contenir ni guillemet, ni chevron, ni barre oblique inverse.",
    }),
});

const schemaValidite = z.strictObject({
  validiteInvitationJours: z
    .number({ error: MESSAGE_VALIDITE })
    .int({ error: MESSAGE_VALIDITE })
    .min(1, { error: MESSAGE_VALIDITE })
    .max(30, { error: MESSAGE_VALIDITE }),
});

const schemaDuree = z
  .number({ error: MESSAGE_DUREE })
  .int({ error: MESSAGE_DUREE })
  .min(1, { error: MESSAGE_DUREE })
  .max(3650, { error: MESSAGE_DUREE });

const schemaConservation = z.strictObject({
  conservationEvenementsJours: schemaDuree,
  conservationResultatsJours: schemaDuree,
  contactDonnees: z
    .string({ error: "Le contact est obligatoire." })
    .trim()
    .min(3, { error: "Le contact est obligatoire." })
    .max(300, { error: "Le contact est trop long." })
    .regex(SANS_CARACTERE_DE_CONTROLE, { error: "Le contact contient des caractères non autorisés." }),
});

async function lireLigne(): Promise<LigneParametres | undefined> {
  const [ligne] = await db().select().from(parametres).where(eq(parametres.id, 1)).limit(1);
  return ligne;
}

function rgpdComplet(ligne: LigneParametres | undefined): boolean {
  return (
    ligne !== undefined &&
    ligne.conservationEvenementsJours !== null &&
    ligne.conservationResultatsJours !== null &&
    ligne.contactDonnees !== null
  );
}

/** Écrit la ligne unique (création à la première écriture). */
async function modifier(
  valeurs: Omit<Partial<typeof parametres.$inferInsert>, "id" | "modifieLe">,
  executeur: Executeur,
): Promise<void> {
  const avecDate = { ...valeurs, modifieLe: maintenant() };
  await executeur
    .insert(parametres)
    .values({ id: 1, ...avecDate })
    .onConflictDoUpdate({ target: parametres.id, set: avecDate });
}

export async function lireParametres(acteur: ActeurUtilisateur): Promise<VueParametres> {
  return journaliserLesRefus(acteur, "parametres.lire", async () => {
    exigerRole(acteur, ["super_admin"]);
    const ligne = await lireLigne();
    return {
      resendConfiguree: Boolean(ligne?.resendCleChiffree),
      emailExpediteur: ligne?.emailExpediteur ?? null,
      nomExpediteur: ligne?.nomExpediteur ?? null,
      validiteInvitationJours: ligne?.validiteInvitationJours ?? VALIDITE_INVITATION_DEFAUT_JOURS,
      conservationEvenementsJours: ligne?.conservationEvenementsJours ?? null,
      conservationResultatsJours: ligne?.conservationResultatsJours ?? null,
      contactDonnees: ligne?.contactDonnees ?? null,
      rgpdComplet: rgpdComplet(ligne),
    };
  });
}

export async function lireValiditeInvitationJours(): Promise<number> {
  return (await lireLigne())?.validiteInvitationJours ?? VALIDITE_INVITATION_DEFAUT_JOURS;
}

/** Durées de conservation et contact renseignés : condition du lancement d'une session (§9.4). */
export async function parametresRgpdComplets(): Promise<boolean> {
  return rgpdComplet(await lireLigne());
}

/**
 * Durées de conservation et contact affichés aux étudiants sur l'écran d'information (spec §9.4,
 * décision D11 du plan du lot 4) : lecture publique, sans acteur. Null tant qu'ils ne sont pas tous
 * renseignés : l'écran n'affiche jamais de texte provisoire.
 */
export async function lireInformationDonnees(): Promise<InformationDonnees | null> {
  const ligne = await lireLigne();
  if (
    !ligne ||
    ligne.conservationEvenementsJours === null ||
    ligne.conservationResultatsJours === null ||
    ligne.contactDonnees === null
  ) {
    return null;
  }
  return {
    conservationEvenementsJours: ligne.conservationEvenementsJours,
    conservationResultatsJours: ligne.conservationResultatsJours,
    contact: ligne.contactDonnees,
  };
}

/**
 * Configuration d'envoi (clé déchiffrée), ou null si elle est incomplète ou illisible (clé de
 * chiffrement changée). Réservée au module emails : la clé ne va jamais vers une page.
 */
export async function lireConfigurationEnvoi(): Promise<ConfigurationEnvoi | null> {
  const ligne = await lireLigne();
  if (!ligne?.resendCleChiffree || !ligne.emailExpediteur || !ligne.nomExpediteur) return null;
  try {
    return {
      cleApi: dechiffrer(ligne.resendCleChiffree),
      expediteur: `"${ligne.nomExpediteur}" <${ligne.emailExpediteur}>`,
    };
  } catch (erreur) {
    journaliserErreurInattendue("parametres", referenceErreur(), erreur);
    return null;
  }
}

export async function enregistrerEnvoiEmails(
  acteur: ActeurUtilisateur,
  saisie: { cleApi: string; emailExpediteur: string; nomExpediteur: string },
): Promise<void> {
  return journaliserLesRefus(acteur, "parametres.modifier_envoi", async () => {
    exigerRole(acteur, ["super_admin"]);
    const resultat = schemaEnvoi.safeParse(saisie);
    if (!resultat.success) throw erreurDepuisZod(resultat.error, "Envoi des emails");
    const { cleApi, emailExpediteur, nomExpediteur } = resultat.data;
    if (cleApi === "" && !(await lireLigne())?.resendCleChiffree) {
      throw erreurs.validation("Renseigne la clé Resend.", [
        { chemin: "cleApi", message: "Renseigne la clé Resend." },
      ]);
    }
    await db().transaction(async (tx) => {
      await modifier(
        { emailExpediteur, nomExpediteur, ...(cleApi === "" ? {} : { resendCleChiffree: chiffrer(cleApi) }) },
        tx,
      );
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "parametres.modifier_envoi",
          details: { cleRemplacee: cleApi !== "" },
        },
        tx,
      );
    });
  });
}

export async function enregistrerValiditeInvitations(
  acteur: ActeurUtilisateur,
  saisie: { validiteInvitationJours: number },
): Promise<void> {
  return journaliserLesRefus(acteur, "parametres.modifier_invitations", async () => {
    exigerRole(acteur, ["super_admin"]);
    const resultat = schemaValidite.safeParse(saisie);
    if (!resultat.success) throw erreurDepuisZod(resultat.error, "Invitations");
    await db().transaction(async (tx) => {
      await modifier(resultat.data, tx);
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "parametres.modifier_invitations",
          details: resultat.data,
        },
        tx,
      );
    });
  });
}

export async function enregistrerConservation(
  acteur: ActeurUtilisateur,
  saisie: { conservationEvenementsJours: number; conservationResultatsJours: number; contactDonnees: string },
): Promise<void> {
  return journaliserLesRefus(acteur, "parametres.modifier_conservation", async () => {
    exigerRole(acteur, ["super_admin"]);
    const resultat = schemaConservation.safeParse(saisie);
    if (!resultat.success) throw erreurDepuisZod(resultat.error, "Conservation des données");
    const { conservationEvenementsJours, conservationResultatsJours } = resultat.data;
    await db().transaction(async (tx) => {
      await modifier(resultat.data, tx);
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "parametres.modifier_conservation",
          details: { conservationEvenementsJours, conservationResultatsJours },
        },
        tx,
      );
    });
  });
}
