/**
 * Contrôles partagés du module classes (plan du lot 2, décisions D1 à D5 et D14) : identifiants,
 * propriété des classes, noms de classes et d'étudiants.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Executeur, Transaction } from "@/db";
import { classe, etudiant } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { erreurs, type ErreurService } from "@/lib/erreurs";
import { normaliserNom } from "@/lib/noms";

export { lireIdentifiant, valider } from "@/lib/validation";

export const MAX_CLASSES_PAR_COMPTE = 200;
export const MAX_ETUDIANTS_PAR_CLASSE = 500;
export const LONGUEUR_MAX_NOM_CLASSE = 60;
export const LONGUEUR_MAX_NOM_ETUDIANT = 100;

const CARACTERE_DE_CONTROLE = /\p{Cc}/u;

/** Tri naturel en français : « TD2 » avant « TD10 », sans tenir compte de la casse ni des accents. */
const COLLATEUR = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

export function comparerNoms(a: string, b: string): number {
  return COLLATEUR.compare(a, b);
}

export function comparerEtudiants(
  a: { nom: string; prenom: string },
  b: { nom: string; prenom: string },
): number {
  return comparerNoms(a.nom, b.nom) || comparerNoms(a.prenom, b.prenom);
}

/** Espaces rognés et réduits à un seul (tabulations et retours à la ligne compris). */
export function nettoyerTexte(valeur: string): string {
  return valeur.replace(/\s+/g, " ").trim();
}

/** Problème d'un nom ou d'un prénom d'étudiant déjà nettoyé, ou null (décision D5). */
export function problemeNomEtudiant(valeur: string, libelle: "Le nom" | "Le prénom"): string | null {
  if (valeur === "") return `${libelle} est obligatoire.`;
  if (valeur.length > LONGUEUR_MAX_NOM_ETUDIANT) {
    return `${libelle} dépasse ${LONGUEUR_MAX_NOM_ETUDIANT} caractères.`;
  }
  if (CARACTERE_DE_CONTROLE.test(valeur)) return `${libelle} contient des caractères non autorisés.`;
  if (normaliserNom(valeur) === "") return `${libelle} doit contenir au moins une lettre ou un chiffre.`;
  return null;
}

/** Nom ou prénom d'étudiant saisi : nettoyé, puis contrôlé par `problemeNomEtudiant`. */
export function schemaNomEtudiant(libelle: "Le nom" | "Le prénom") {
  return z
    .string({ error: `${libelle} est obligatoire.` })
    .transform(nettoyerTexte)
    .superRefine((valeur, contexte) => {
      const probleme = problemeNomEtudiant(valeur, libelle);
      if (probleme) contexte.addIssue({ code: "custom", message: probleme });
    });
}

/** Nom de classe : nettoyé, 1 à 60 caractères, sans caractère de contrôle (décision D3). */
export const schemaNomClasse = z
  .string({ error: "Le nom de la classe est obligatoire." })
  .transform(nettoyerTexte)
  .pipe(
    z
      .string()
      .min(1, { error: "Le nom de la classe est obligatoire." })
      .max(LONGUEUR_MAX_NOM_CLASSE, {
        error: `Le nom de la classe dépasse ${LONGUEUR_MAX_NOM_CLASSE} caractères.`,
      })
      .regex(/^[^\p{Cc}]*$/u, { error: "Le nom de la classe contient des caractères non autorisés." }),
  );

export function erreurHomonyme(prenom: string, nom: string): ErreurService {
  return erreurs.validation(
    `${prenom} ${nom} est déjà dans la classe : distingue-les par une initiale ou un second prénom.`,
  );
}

export type ClasseLue = { id: string; nom: string; archivee: boolean };

/**
 * Classe de l'acteur. `verrouiller` la lit `FOR UPDATE` : toute écriture sur une classe ou ses
 * étudiants la verrouille d'abord (décision D14). Classe d'un autre compte : même réponse qu'une
 * classe inexistante, refus journalisé par `journaliserLesRefus` (décision D2).
 */
export async function classeDeLActeur(
  executeur: Executeur,
  acteur: ActeurUtilisateur,
  classeId: string,
  verrouiller = false,
): Promise<ClasseLue> {
  const requete = executeur
    .select({ id: classe.id, enseignantId: classe.enseignantId, nom: classe.nom, archivee: classe.archivee })
    .from(classe)
    .where(eq(classe.id, classeId));
  const [ligne] = verrouiller ? await requete.for("update") : await requete;
  if (!ligne) throw erreurs.introuvable("Classe");
  if (ligne.enseignantId !== acteur.id) throw erreurs.ressourceAutrui("Classe");
  return { id: ligne.id, nom: ligne.nom, archivee: ligne.archivee };
}

export type EtudiantLu = { id: string; classeId: string; nom: string; prenom: string; tiersTemps: boolean };

/**
 * Étudiant d'une classe de l'acteur, sa classe verrouillée puis lui-même (décision D14).
 * Étudiant d'un autre compte : « Étudiant introuvable. », refus journalisé.
 */
export async function etudiantDeLActeur(
  tx: Transaction,
  acteur: ActeurUtilisateur,
  etudiantId: string,
): Promise<EtudiantLu> {
  const [proprietaire] = await tx
    .select({ classeId: etudiant.classeId, enseignantId: classe.enseignantId })
    .from(etudiant)
    .innerJoin(classe, eq(classe.id, etudiant.classeId))
    .where(eq(etudiant.id, etudiantId));
  if (!proprietaire) throw erreurs.introuvable("Étudiant");
  if (proprietaire.enseignantId !== acteur.id) throw erreurs.ressourceAutrui("Étudiant");
  await classeDeLActeur(tx, acteur, proprietaire.classeId, true);
  const [ligne] = await tx
    .select({
      id: etudiant.id,
      classeId: etudiant.classeId,
      nom: etudiant.nom,
      prenom: etudiant.prenom,
      tiersTemps: etudiant.tiersTemps,
    })
    .from(etudiant)
    .where(eq(etudiant.id, etudiantId))
    .for("update");
  // Retiré par un autre onglet entre la première lecture et le verrou.
  if (!ligne) throw erreurs.introuvable("Étudiant");
  return ligne;
}
