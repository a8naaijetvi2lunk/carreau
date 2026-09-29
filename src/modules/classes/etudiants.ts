/**
 * Étudiants d'une classe (spec §4.2 et §9.1 ; décisions D5, D14 et D15 du plan du lot 2) : ajout,
 * modification, tiers-temps, retrait. Chaque écriture verrouille la classe : la limite de 500 et
 * les homonymes restent justes entre deux onglets.
 */
import "server-only";
import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db, type Transaction } from "@/db";
import { etudiant } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { erreurs } from "@/lib/erreurs";
import { maintenant } from "@/lib/horloge";
import { normaliserNom } from "@/lib/noms";
import { journaliser, journaliserLesRefus } from "@/modules/journal";
import type { EtudiantClasse } from "./classes";
import {
  classeDeLActeur,
  erreurHomonyme,
  etudiantDeLActeur,
  lireIdentifiant,
  MAX_ETUDIANTS_PAR_CLASSE,
  schemaNomEtudiant,
  valider,
} from "./commun";

export const MESSAGE_CLASSE_PLEINE = `La classe compte déjà ${MAX_ETUDIANTS_PAR_CLASSE} étudiants, le maximum.`;

const schemaAjout = z.strictObject({
  classeId: z.string(),
  nom: schemaNomEtudiant("Le nom"),
  prenom: schemaNomEtudiant("Le prénom"),
  tiersTemps: z.boolean({ error: "Le tiers-temps est invalide." }),
});
const schemaModification = z.strictObject({
  etudiantId: z.string(),
  nom: schemaNomEtudiant("Le nom"),
  prenom: schemaNomEtudiant("Le prénom"),
});
const schemaTiersTemps = z.strictObject({
  etudiantId: z.string(),
  tiersTemps: z.boolean({ error: "Le tiers-temps est invalide." }),
});
const schemaEtudiant = z.strictObject({ etudiantId: z.string() });

/** Vrai si un autre étudiant de la classe (hors `sauf`) porte ces nom et prénom normalisés. */
async function homonymeExiste(
  tx: Transaction,
  classeId: string,
  nom: string,
  prenom: string,
  sauf?: string,
): Promise<boolean> {
  const conditions = [
    eq(etudiant.classeId, classeId),
    eq(etudiant.nomNormalise, normaliserNom(nom)),
    eq(etudiant.prenomNormalise, normaliserNom(prenom)),
  ];
  if (sauf) conditions.push(ne(etudiant.id, sauf));
  const [trouve] = await tx
    .select({ id: etudiant.id })
    .from(etudiant)
    .where(and(...conditions))
    .limit(1);
  return trouve !== undefined;
}

function vue(e: { id: string; nom: string; prenom: string; tiersTemps: boolean }): EtudiantClasse {
  return { id: e.id, nom: e.nom, prenom: e.prenom, tiersTemps: e.tiersTemps };
}

export async function ajouterEtudiant(
  acteur: ActeurUtilisateur,
  saisie: { classeId: string; nom: string; prenom: string; tiersTemps: boolean },
): Promise<EtudiantClasse> {
  return journaliserLesRefus(acteur, "etudiants.ajouter", async () => {
    const donnees = valider(schemaAjout, saisie, "Étudiant");
    const classeId = lireIdentifiant(donnees.classeId, "Classe");
    return db().transaction(async (tx) => {
      await classeDeLActeur(tx, acteur, classeId, true);
      const [compte] = await tx
        .select({ total: count() })
        .from(etudiant)
        .where(eq(etudiant.classeId, classeId));
      if ((compte?.total ?? 0) >= MAX_ETUDIANTS_PAR_CLASSE) throw erreurs.etat(MESSAGE_CLASSE_PLEINE);
      if (await homonymeExiste(tx, classeId, donnees.nom, donnees.prenom)) {
        throw erreurHomonyme(donnees.prenom, donnees.nom);
      }
      const [cree] = await tx
        .insert(etudiant)
        .values({
          classeId,
          nom: donnees.nom,
          prenom: donnees.prenom,
          nomNormalise: normaliserNom(donnees.nom),
          prenomNormalise: normaliserNom(donnees.prenom),
          tiersTemps: donnees.tiersTemps,
          creeLe: maintenant(),
        })
        .returning();
      if (!cree) throw new Error("Étudiant non créé.");
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "etudiants.ajouter",
          cible: `etudiant:${cree.id}`,
          details: { classeId },
        },
        tx,
      );
      return vue(cree);
    });
  });
}

export async function modifierEtudiant(
  acteur: ActeurUtilisateur,
  saisie: { etudiantId: string; nom: string; prenom: string },
): Promise<EtudiantClasse> {
  return journaliserLesRefus(acteur, "etudiants.modifier", async () => {
    const donnees = valider(schemaModification, saisie, "Étudiant");
    const etudiantId = lireIdentifiant(donnees.etudiantId, "Étudiant");
    return db().transaction(async (tx) => {
      const lu = await etudiantDeLActeur(tx, acteur, etudiantId);
      if (lu.nom === donnees.nom && lu.prenom === donnees.prenom) return vue(lu);
      if (await homonymeExiste(tx, lu.classeId, donnees.nom, donnees.prenom, lu.id)) {
        throw erreurHomonyme(donnees.prenom, donnees.nom);
      }
      const [modifie] = await tx
        .update(etudiant)
        .set({
          nom: donnees.nom,
          prenom: donnees.prenom,
          nomNormalise: normaliserNom(donnees.nom),
          prenomNormalise: normaliserNom(donnees.prenom),
        })
        .where(eq(etudiant.id, lu.id))
        .returning();
      if (!modifie) throw new Error("Étudiant non modifié.");
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "etudiants.modifier",
          cible: `etudiant:${lu.id}`,
        },
        tx,
      );
      return vue(modifie);
    });
  });
}

/** Tiers-temps (durées × 4/3 à partir du lot 5). Idempotent : la même valeur ne change rien. */
export async function changerTiersTemps(
  acteur: ActeurUtilisateur,
  saisie: { etudiantId: string; tiersTemps: boolean },
): Promise<EtudiantClasse> {
  return journaliserLesRefus(acteur, "etudiants.changer_tiers_temps", async () => {
    const donnees = valider(schemaTiersTemps, saisie, "Étudiant");
    const etudiantId = lireIdentifiant(donnees.etudiantId, "Étudiant");
    return db().transaction(async (tx) => {
      const lu = await etudiantDeLActeur(tx, acteur, etudiantId);
      if (lu.tiersTemps === donnees.tiersTemps) return vue(lu);
      await tx.update(etudiant).set({ tiersTemps: donnees.tiersTemps }).where(eq(etudiant.id, lu.id));
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "etudiants.changer_tiers_temps",
          cible: `etudiant:${lu.id}`,
          details: { tiersTemps: donnees.tiersTemps },
        },
        tx,
      );
      return vue({ ...lu, tiersTemps: donnees.tiersTemps });
    });
  });
}

/** Retire l'étudiant de sa classe (suppression, décision D5). */
export async function retirerEtudiant(
  acteur: ActeurUtilisateur,
  saisie: { etudiantId: string },
): Promise<EtudiantClasse> {
  return journaliserLesRefus(acteur, "etudiants.retirer", async () => {
    const etudiantId = lireIdentifiant(valider(schemaEtudiant, saisie, "Étudiant").etudiantId, "Étudiant");
    return db().transaction(async (tx) => {
      const lu = await etudiantDeLActeur(tx, acteur, etudiantId);
      await tx.delete(etudiant).where(eq(etudiant.id, lu.id));
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "etudiants.retirer",
          cible: `etudiant:${lu.id}`,
          details: { classeId: lu.classeId },
        },
        tx,
      );
      return vue(lu);
    });
  });
}
