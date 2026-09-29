/**
 * Classes d'un compte (spec §4.2 et §9.1 ; décisions D1 à D4, D14 et D15 du plan du lot 2).
 * Toute classe appartient au compte qui l'a créée ; personne d'autre ne la voit.
 */
import "server-only";
import { count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { classe, etudiant, utilisateur } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { erreurDepuisDetails, erreurs, type ErreurService } from "@/lib/erreurs";
import { estViolationUnicite } from "@/lib/erreurs-sql";
import { maintenant } from "@/lib/horloge";
import { journaliser, journaliserLesRefus } from "@/modules/journal";
import {
  classeDeLActeur,
  comparerEtudiants,
  comparerNoms,
  lireIdentifiant,
  MAX_CLASSES_PAR_COMPTE,
  schemaNomClasse,
  valider,
} from "./commun";

export type ClasseResume = {
  id: string;
  nom: string;
  archivee: boolean;
  effectif: number;
  effectifTiersTemps: number;
};
export type EtudiantClasse = { id: string; nom: string; prenom: string; tiersTemps: boolean };
export type ClasseDetaillee = { id: string; nom: string; archivee: boolean; etudiants: EtudiantClasse[] };

export const MESSAGE_LIMITE_CLASSES = `Tu as atteint la limite de ${MAX_CLASSES_PAR_COMPTE} classes : archive ou renomme une classe existante.`;

const INDEX_NOM_CLASSE = "classe_enseignant_nom_unique";

const schemaCreation = z.strictObject({ nom: schemaNomClasse });
const schemaRenommage = z.strictObject({ classeId: z.string(), nom: schemaNomClasse });
const schemaClasse = z.strictObject({ classeId: z.string() });

function erreurNomPris(nom: string): ErreurService {
  return erreurDepuisDetails(
    [{ chemin: "nom", message: `Tu as déjà une classe nommée « ${nom} ».` }],
    "Classe",
  );
}

/** Toutes les classes de l'acteur, archivées comprises, avec leur effectif (tri naturel sur le nom). */
export async function listerClasses(acteur: ActeurUtilisateur): Promise<ClasseResume[]> {
  return journaliserLesRefus(acteur, "classes.lister", async () => {
    const lignes = await db()
      .select({
        id: classe.id,
        nom: classe.nom,
        archivee: classe.archivee,
        effectif: count(etudiant.id),
        effectifTiersTemps: sql<number>`count(${etudiant.id}) filter (where ${etudiant.tiersTemps})`.mapWith(
          Number,
        ),
      })
      .from(classe)
      .leftJoin(etudiant, eq(etudiant.classeId, classe.id))
      .where(eq(classe.enseignantId, acteur.id))
      .groupBy(classe.id);
    return lignes.sort((a, b) => comparerNoms(a.nom, b.nom));
  });
}

/** Une classe de l'acteur et ses étudiants (tri par nom puis prénom). */
export async function lireClasse(
  acteur: ActeurUtilisateur,
  saisie: { classeId: string },
): Promise<ClasseDetaillee> {
  return journaliserLesRefus(acteur, "classes.lire", async () => {
    const classeId = lireIdentifiant(valider(schemaClasse, saisie, "Classe").classeId, "Classe");
    const lue = await classeDeLActeur(db(), acteur, classeId);
    const etudiants = await db()
      .select({
        id: etudiant.id,
        nom: etudiant.nom,
        prenom: etudiant.prenom,
        tiersTemps: etudiant.tiersTemps,
      })
      .from(etudiant)
      .where(eq(etudiant.classeId, classeId));
    return { ...lue, etudiants: etudiants.sort(comparerEtudiants) };
  });
}

export async function creerClasse(
  acteur: ActeurUtilisateur,
  saisie: { nom: string },
): Promise<{ id: string }> {
  return journaliserLesRefus(acteur, "classes.creer", async () => {
    const { nom } = valider(schemaCreation, saisie, "Classe");
    try {
      return await db().transaction(async (tx) => {
        // Sérialise les créations d'un même compte : la limite de 200 reste juste en concurrence.
        await tx
          .select({ id: utilisateur.id })
          .from(utilisateur)
          .where(eq(utilisateur.id, acteur.id))
          .for("update");
        const [compte] = await tx
          .select({ total: count() })
          .from(classe)
          .where(eq(classe.enseignantId, acteur.id));
        if ((compte?.total ?? 0) >= MAX_CLASSES_PAR_COMPTE) throw erreurs.etat(MESSAGE_LIMITE_CLASSES);
        const [creee] = await tx
          .insert(classe)
          .values({ enseignantId: acteur.id, nom, creeLe: maintenant() })
          .returning({ id: classe.id });
        if (!creee) throw new Error("Classe non créée.");
        await journaliser(
          {
            acteur: { type: "utilisateur", id: acteur.id },
            action: "classes.creer",
            cible: `classe:${creee.id}`,
          },
          tx,
        );
        return { id: creee.id };
      });
    } catch (erreur) {
      if (estViolationUnicite(erreur, INDEX_NOM_CLASSE)) throw erreurNomPris(nom);
      throw erreur;
    }
  });
}

export async function renommerClasse(
  acteur: ActeurUtilisateur,
  saisie: { classeId: string; nom: string },
): Promise<void> {
  return journaliserLesRefus(acteur, "classes.renommer", async () => {
    const donnees = valider(schemaRenommage, saisie, "Classe");
    const classeId = lireIdentifiant(donnees.classeId, "Classe");
    try {
      await db().transaction(async (tx) => {
        const lue = await classeDeLActeur(tx, acteur, classeId, true);
        if (lue.nom === donnees.nom) return;
        await tx.update(classe).set({ nom: donnees.nom }).where(eq(classe.id, classeId));
        await journaliser(
          {
            acteur: { type: "utilisateur", id: acteur.id },
            action: "classes.renommer",
            cible: `classe:${classeId}`,
          },
          tx,
        );
      });
    } catch (erreur) {
      if (estViolationUnicite(erreur, INDEX_NOM_CLASSE)) throw erreurNomPris(donnees.nom);
      throw erreur;
    }
  });
}

async function changerArchivage(
  acteur: ActeurUtilisateur,
  saisie: { classeId: string },
  archivee: boolean,
): Promise<void> {
  const action = archivee ? "classes.archiver" : "classes.restaurer";
  return journaliserLesRefus(acteur, action, async () => {
    const classeId = lireIdentifiant(valider(schemaClasse, saisie, "Classe").classeId, "Classe");
    await db().transaction(async (tx) => {
      const lue = await classeDeLActeur(tx, acteur, classeId, true);
      if (lue.archivee === archivee) {
        throw erreurs.etat(archivee ? "Cette classe est déjà archivée." : "Cette classe n'est pas archivée.");
      }
      await tx.update(classe).set({ archivee }).where(eq(classe.id, classeId));
      await journaliser(
        { acteur: { type: "utilisateur", id: acteur.id }, action, cible: `classe:${classeId}` },
        tx,
      );
    });
  });
}

/** Range la classe dans « Classes archivées » (décision D4) ; elle reste consultable et modifiable. */
export async function archiverClasse(acteur: ActeurUtilisateur, saisie: { classeId: string }): Promise<void> {
  return changerArchivage(acteur, saisie, true);
}

export async function restaurerClasse(
  acteur: ActeurUtilisateur,
  saisie: { classeId: string },
): Promise<void> {
  return changerArchivage(acteur, saisie, false);
}
