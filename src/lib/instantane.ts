/**
 * Instantané d'un QCM figé dans sa session (spec §4.3, décision D3 du plan du lot 5) et ordre d'un
 * étudiant (D4). Écrit au démarrage, lu par le moteur et le module examen, jamais envoyé tel quel au
 * téléphone (il contient les bonnes réponses). Imports relatifs : le schéma de la base importe ces
 * types sans les alias de tsconfig.json.
 */
import { z } from "zod";
import { MODES_CHRONO, TYPES_QUESTION } from "./regles-qcm";

const schemaImage = z
  .strictObject({ id: z.uuid(), largeur: z.int().positive(), hauteur: z.int().positive() })
  .nullable();

const schemaJeton = z.strictObject({ texte: z.string(), couleur: z.string() });

/** Question figée : `cle` est l'identifiant de la question d'origine (clé stable, spec §4.3). */
export const schemaQuestionInstantanee = z.strictObject({
  cle: z.uuid(),
  type: z.enum(TYPES_QUESTION),
  enonce: z.string(),
  image: schemaImage,
  /** Code déjà coloré par le serveur : des jetons de texte, jamais du HTML. */
  code: z.strictObject({ libelle: z.string(), lignes: z.array(z.array(schemaJeton)) }).nullable(),
  propositions: z
    .array(z.strictObject({ texte: z.string(), image: schemaImage, correcte: z.boolean() }))
    .min(2)
    .max(8),
  pointsBonne: z.number().positive(),
  pointsMauvaise: z.number().max(0),
  pointsVide: z.number().max(0),
  /** Durée effective en chrono par question (surcharge ou durée du QCM), null dans les autres modes. */
  dureeS: z.int().positive().nullable(),
  lieeASuivante: z.boolean(),
});
export type QuestionInstantanee = z.infer<typeof schemaQuestionInstantanee>;

export const schemaContenuSession = z
  .strictObject({
    version: z.literal(1),
    titre: z.string(),
    modeChrono: z.enum(MODES_CHRONO),
    /** Chrono global seulement. */
    dureeGlobaleS: z.int().positive().nullable(),
    questions: z.array(schemaQuestionInstantanee).min(1),
  })
  .refine((c) => c.modeChrono !== "global" || c.dureeGlobaleS !== null, {
    error: "Durée globale absente.",
  })
  .refine((c) => c.modeChrono !== "par_question" || c.questions.every((q) => q.dureeS !== null), {
    error: "Durée d'une question absente.",
  });
export type ContenuSession = z.infer<typeof schemaContenuSession>;

/**
 * Ordre d'un étudiant (spec §6.7, décision D4) : `q`, index de la question dans l'instantané ; `p`,
 * index d'origine des propositions dans l'ordre affiché. Rang de l'étudiant = position + 1.
 */
export const schemaOrdre = z
  .array(z.strictObject({ q: z.int().nonnegative(), p: z.array(z.int().nonnegative()).min(2).max(8) }))
  .min(1);
export type OrdrePassage = z.infer<typeof schemaOrdre>;
