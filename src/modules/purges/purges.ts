/**
 * Purges nocturnes (spec §14, lot 10 ; décision D4 du plan) : étapes isolées, dans l'ordre de
 * ETAPES_PURGE. Un échec est journalisé et nommé dans le bilan ; les étapes suivantes tournent. Le
 * bilan est journalisé à la fin, après la purge du journal. Fonction système, sans acteur : seule la
 * route protégée par CRON_SECRET l'appelle.
 */
import "server-only";
import { referenceErreur } from "@/lib/action";
import { maintenant } from "@/lib/horloge";
import { journaliserErreurInattendue } from "@/lib/journal-erreur";
import { AGE_LIMITEUR_S, type BilanPurges, type EtapePurge } from "@/lib/regles-purges";
import type { InformationDonnees } from "@/lib/vue-entree";
import { purgerImagesOrphelines } from "@/modules/images";
import { journaliser } from "@/modules/journal";
import { purgerLimiteur } from "@/modules/limiteur";
import { lireInformationDonnees } from "@/modules/parametres";
import { purgerEvenements, purgerSessions } from "./donnees";
import { purgerConnexions, purgerInvitations, purgerJetons, purgerJournal } from "./technique";

export async function executerPurges(): Promise<BilanPurges> {
  const instant = maintenant();
  const erreurs: EtapePurge[] = [];

  async function etape<T>(nom: EtapePurge, travail: () => Promise<T>): Promise<T | null> {
    try {
      return await travail();
    } catch (erreur) {
      erreurs.push(nom);
      journaliserErreurInattendue(`purges:${nom}`, referenceErreur(), erreur);
      return null;
    }
  }

  // Conservation illisible : les deux étapes des données d'examen échouent (elles ne devinent rien).
  let conservation: InformationDonnees | null = null;
  let echecLecture: Error | null = null;
  try {
    conservation = await lireInformationDonnees();
  } catch (erreur) {
    echecLecture = erreur instanceof Error ? erreur : new Error(String(erreur));
  }
  const selonConservation = (purger: (c: InformationDonnees) => Promise<number>) => async () => {
    if (echecLecture) throw echecLecture;
    return conservation ? purger(conservation) : 0;
  };

  const bilan: BilanPurges = {
    conservationRenseignee: conservation !== null,
    evenements: await etape(
      "evenements",
      selonConservation((c) => purgerEvenements(c.conservationEvenementsJours, instant)),
    ),
    sessions: await etape(
      "sessions",
      selonConservation((c) => purgerSessions(c.conservationResultatsJours, instant)),
    ),
    images: await etape("images", () => purgerImagesOrphelines(instant)),
    connexions: await etape("connexions", () => purgerConnexions(instant)),
    jetons: await etape("jetons", () => purgerJetons(instant)),
    invitations: await etape("invitations", () => purgerInvitations(instant)),
    limiteur: await etape("limiteur", () => purgerLimiteur(AGE_LIMITEUR_S)),
    journal: await etape("journal", () => purgerJournal(instant)),
    erreurs,
  };

  try {
    const { images, ...compteurs } = bilan;
    await journaliser({
      acteur: { type: "systeme" },
      action: "purges.executer",
      details: {
        ...compteurs,
        imagesLignes: images?.lignes ?? null,
        imagesFichiers: images?.fichiers ?? null,
        imagesTemporaires: images?.temporaires ?? null,
      },
    });
  } catch (erreur) {
    journaliserErreurInattendue("purges:bilan", referenceErreur(), erreur);
  }
  return bilan;
}
