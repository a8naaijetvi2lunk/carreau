import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
// Chemin relatif : drizzle-kit charge le schéma sans les alias de tsconfig.json.
import {
  MOTIFS_DEMANDE,
  STATUTS_DEMANDE,
  STATUTS_PARTICIPATION,
  STATUTS_SESSION,
} from "../../lib/regles-session";
import type { ContenuSession, OrdrePassage } from "../../lib/instantane";
import { ORIGINES_REPONSE } from "../../lib/regles-examen";
import { classe, etudiant } from "./classes";
import { utilisateur } from "./comptes";
import { qcm } from "./qcm";

export const enumStatutSession = pgEnum("statut_session", STATUTS_SESSION);
export const enumStatutParticipation = pgEnum("statut_participation", STATUTS_PARTICIPATION);
export const enumMotifDemande = pgEnum("motif_demande", MOTIFS_DEMANDE);
export const enumStatutDemande = pgEnum("statut_demande", STATUTS_DEMANDE);
export const enumOrigineReponse = pgEnum("origine_reponse", ORIGINES_REPONSE);

/**
 * Sessions d'examen (spec §4.3) : un QCM prêt × une classe, du même compte (décision D1 du plan du
 * lot 4). L'instantané et la fin prévue sont écrits au démarrage (lot 5) ; le rattrapage arrive au
 * lot 7.
 */
export const sessionExamen = pgTable(
  "session_examen",
  {
    id: uuid().defaultRandom().primaryKey(),
    qcmId: uuid()
      .notNull()
      .references(() => qcm.id, { onDelete: "restrict" }),
    classeId: uuid()
      .notNull()
      .references(() => classe.id, { onDelete: "restrict" }),
    enseignantId: uuid()
      .notNull()
      .references(() => utilisateur.id, { onDelete: "restrict" }),
    statut: enumStatutSession().notNull().default("attente"),
    // Secret du code tournant (spec §6.1) : 32 octets en base64url, jamais envoyé au navigateur.
    codeSecret: text().notNull(),
    creneauPrevuLe: timestamp({ withTimezone: true }),
    noteVisible: boolean().notNull(),
    correctionVisible: boolean().notNull(),
    creeLe: timestamp({ withTimezone: true }).notNull(),
    demarreLe: timestamp({ withTimezone: true }),
    termineLe: timestamp({ withTimezone: true }),
    // Instantané du QCM, écrit au démarrage (spec §4.3, décision D3 du plan du lot 5).
    contenu: jsonb().$type<ContenuSession>(),
    finPrevueLe: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("session_examen_enseignant_idx").on(t.enseignantId),
    index("session_examen_statut_idx").on(t.statut),
  ],
);

/**
 * Un étudiant dans une session, lié à un appareil (spec §6.2) : seule l'empreinte SHA-256 du jeton
 * de l'appareil est stockée (décision D7).
 */
export const participation = pgTable(
  "participation",
  {
    id: uuid().defaultRandom().primaryKey(),
    sessionId: uuid()
      .notNull()
      .references(() => sessionExamen.id, { onDelete: "cascade" }),
    // RESTRICT : un étudiant qui a participé ne se retire plus de sa classe (décision D13).
    etudiantId: uuid()
      .notNull()
      .references(() => etudiant.id, { onDelete: "restrict" }),
    appareilJetonHash: text().notNull(),
    statut: enumStatutParticipation().notNull().default("attente"),
    informationLueLe: timestamp({ withTimezone: true }),
    rejointeLe: timestamp({ withTimezone: true }).notNull(),
    dernierContactLe: timestamp({ withTimezone: true }).notNull(),
    // Passage de l'examen (plan du lot 5) : tiers-temps figé au départ (A1), ordre et échéances (D2, D4).
    tiersTemps: boolean().notNull().default(false),
    ordre: jsonb().$type<OrdrePassage>(),
    indexCourant: integer().notNull().default(0),
    questionServieLe: timestamp({ withTimezone: true }),
    echeanceQuestionLe: timestamp({ withTimezone: true }),
    echeanceGlobaleLe: timestamp({ withTimezone: true }),
    termineeLe: timestamp({ withTimezone: true }),
    points: numeric({ precision: 8, scale: 2, mode: "number" }),
    // Nom de colonne explicite (spec §4.3, D1) : la conversion snake_case automatique de drizzle-kit
    // donnerait "note_sur20" (un seul chiffre final n'est pas séparé par un underscore).
    noteSur20: numeric("note_sur_20", { precision: 5, scale: 2, mode: "number" }),
  },
  (t) => [
    uniqueIndex("participation_session_etudiant_unique").on(t.sessionId, t.etudiantId),
    uniqueIndex("participation_appareil_unique").on(t.appareilJetonHash),
    index("participation_session_statut_idx").on(t.sessionId, t.statut),
  ],
);

/**
 * Demandes d'un second appareil pour un nom déjà réclamé (spec §6.2, décision D10) : une seule en
 * attente par participation. `ancien_jeton_hash`, posé à l'autorisation, permet de dire à l'ancien
 * téléphone qu'un autre l'a remplacé.
 */
export const demandeAppareil = pgTable(
  "demande_appareil",
  {
    id: uuid().defaultRandom().primaryKey(),
    participationId: uuid()
      .notNull()
      .references(() => participation.id, { onDelete: "cascade" }),
    motif: enumMotifDemande().notNull(),
    jetonHash: text().notNull(),
    ancienJetonHash: text(),
    statut: enumStatutDemande().notNull().default("en_attente"),
    creeLe: timestamp({ withTimezone: true }).notNull(),
    traiteeLe: timestamp({ withTimezone: true }),
    traiteePar: uuid().references(() => utilisateur.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("demande_appareil_jeton_unique").on(t.jetonHash),
    uniqueIndex("demande_appareil_en_attente_unique")
      .on(t.participationId)
      .where(sql`${t.statut} = 'en_attente'`),
    index("demande_appareil_ancien_jeton_idx").on(t.ancienJetonHash),
  ],
);

/**
 * Événements horodatés par le serveur (spec §4.3 et §8.2). Au lot 4, seul « second_appareil » est
 * écrit ; la capture côté téléphone arrive au lot 6.
 */
export const evenement = pgTable(
  "evenement",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    participationId: uuid()
      .notNull()
      .references(() => participation.id, { onDelete: "cascade" }),
    type: text().notNull(),
    recuLe: timestamp({ withTimezone: true }).notNull(),
    dureeMs: integer(),
    questionIndex: integer(),
    details: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("evenement_participation_recu_idx").on(t.participationId, t.recuLe)],
);

/**
 * Réponses d'un étudiant (spec §4.3, décision D1 du plan du lot 5) : brouillon à chaque touche, puis
 * validation par l'étudiant, à l'échéance ou à la fin. Sélections en index d'origine des propositions,
 * triés : la correction ne dépend pas de l'ordre affiché.
 */
export const reponse = pgTable(
  "reponse",
  {
    id: uuid().defaultRandom().primaryKey(),
    participationId: uuid()
      .notNull()
      .references(() => participation.id, { onDelete: "cascade" }),
    questionCle: text().notNull(),
    selectionBrouillon: jsonb().$type<number[]>(),
    selection: jsonb().$type<number[]>(),
    valideeLe: timestamp({ withTimezone: true }),
    origine: enumOrigineReponse(),
    points: numeric({ precision: 6, scale: 2, mode: "number" }),
  },
  (t) => [
    uniqueIndex("reponse_participation_question_unique").on(t.participationId, t.questionCle),
    check(
      "reponse_validation_complete",
      sql`(${t.valideeLe} is null) = (${t.selection} is null) and (${t.valideeLe} is null) = (${t.origine} is null) and (${t.valideeLe} is null) = (${t.points} is null)`,
    ),
  ],
);
