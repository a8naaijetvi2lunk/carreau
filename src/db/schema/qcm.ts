import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
// Chemin relatif : drizzle-kit charge le schéma sans les alias de tsconfig.json.
import { MODES_CHRONO, ORIGINES_QCM, STATUTS_QCM, TYPES_QUESTION } from "../../lib/regles-qcm";
import { utilisateur } from "./comptes";
import { image } from "./images";

export const enumStatutQcm = pgEnum("statut_qcm", STATUTS_QCM);
export const enumOrigineQcm = pgEnum("origine_qcm", ORIGINES_QCM);
export const enumModeChrono = pgEnum("mode_chrono", MODES_CHRONO);
export const enumTypeQuestion = pgEnum("type_question", TYPES_QUESTION);

/**
 * QCM (spec §4.2) : appartient au compte qui l'a créé. Jamais supprimé : archivé (décision D5 du
 * plan du lot 3). Les durées sont en secondes.
 */
export const qcm = pgTable(
  "qcm",
  {
    id: uuid().defaultRandom().primaryKey(),
    enseignantId: uuid()
      .notNull()
      .references(() => utilisateur.id, { onDelete: "restrict" }),
    titre: text().notNull(),
    statut: enumStatutQcm().notNull().default("brouillon"),
    origine: enumOrigineQcm().notNull().default("interface"),
    modeChrono: enumModeChrono().notNull().default("aucun"),
    dureeGlobaleS: integer(),
    dureeQuestionS: integer(),
    noteVisibleDefaut: boolean().notNull().default(true),
    correctionVisibleDefaut: boolean().notNull().default(false),
    creeLe: timestamp({ withTimezone: true }).notNull(),
    modifieLe: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [index("qcm_enseignant_idx").on(t.enseignantId)],
);

/**
 * Questions d'un QCM (spec §4.2), positions 1..n contiguës. Une question en brouillon peut être
 * incomplète : les règles de complétude sont vérifiées au passage en « prêt » (décision D4).
 */
export const question = pgTable(
  "question",
  {
    id: uuid().defaultRandom().primaryKey(),
    qcmId: uuid()
      .notNull()
      .references(() => qcm.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    type: enumTypeQuestion().notNull().default("unique"),
    enonce: text().notNull().default(""),
    imageId: uuid().references(() => image.id, { onDelete: "restrict" }),
    codeLangage: text(),
    codeSource: text(),
    pointsBonne: numeric({ precision: 6, scale: 2, mode: "number" }).notNull().default(1),
    pointsMauvaise: numeric({ precision: 6, scale: 2, mode: "number" }).notNull().default(0),
    pointsVide: numeric({ precision: 6, scale: 2, mode: "number" }).notNull().default(0),
    // Surcharge facultative de la durée par question (chrono par question).
    dureeS: integer(),
    // Liaison portée par la question du dessus (spec §4.2, décision D6).
    lieeASuivante: boolean().notNull().default(false),
  },
  (t) => [
    uniqueIndex("question_qcm_position_unique").on(t.qcmId, t.position),
    check("question_code_complet", sql`(${t.codeLangage} is null) = (${t.codeSource} is null)`),
  ],
);

/** Réponses proposées (spec §4.2), positions 1..n, remplacées en bloc à chaque enregistrement (décision D8). */
export const proposition = pgTable(
  "proposition",
  {
    id: uuid().defaultRandom().primaryKey(),
    questionId: uuid()
      .notNull()
      .references(() => question.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    texte: text().notNull().default(""),
    imageId: uuid().references(() => image.id, { onDelete: "restrict" }),
    correcte: boolean().notNull().default(false),
  },
  (t) => [uniqueIndex("proposition_question_position_unique").on(t.questionId, t.position)],
);
