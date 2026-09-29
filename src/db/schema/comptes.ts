import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const roleUtilisateur = pgEnum("role_utilisateur", ["super_admin", "admin", "enseignant"]);

export const porteeJetonMcp = pgEnum("portee_jeton_mcp", ["lecture", "ecriture"]);

/** Comptes enseignants et administrateurs (spec §4.1). Créés à l'activation d'une invitation. */
export const utilisateur = pgTable(
  "utilisateur",
  {
    id: uuid().defaultRandom().primaryKey(),
    email: text().notNull(),
    nom: text().notNull(),
    prenom: text().notNull(),
    role: roleUtilisateur().notNull(),
    motDePasseHash: text().notNull(),
    // Nul : double authentification à enrôler (compte neuf ou TOTP réinitialisé).
    totpSecretChiffre: text(),
    // Dernier pas TOTP accepté (anti-rejeu).
    totpDernierPas: integer(),
    actif: boolean().notNull().default(true),
    creeLe: timestamp({ withTimezone: true }).notNull(),
    derniereConnexionLe: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("utilisateur_email_unique").on(t.email),
    check("utilisateur_email_minuscules", sql`${t.email} = lower(${t.email})`),
  ],
);

/**
 * Sessions de connexion : seule l'empreinte SHA-256 du jeton est stockée. Une session en
 * attente de double authentification (`doubleAuthValidee` faux) dure 10 minutes et peut porter
 * le secret TOTP en cours d'enrôlement, chiffré.
 */
export const sessionConnexion = pgTable(
  "session_connexion",
  {
    id: uuid().defaultRandom().primaryKey(),
    utilisateurId: uuid()
      .notNull()
      .references(() => utilisateur.id, { onDelete: "cascade" }),
    jetonHash: text().notNull(),
    creeLe: timestamp({ withTimezone: true }).notNull(),
    derniereActiviteLe: timestamp({ withTimezone: true }).notNull(),
    expireLe: timestamp({ withTimezone: true }).notNull(),
    doubleAuthValidee: boolean().notNull().default(false),
    resterConnecte: boolean().notNull().default(false),
    totpEnAttenteChiffre: text(),
  },
  (t) => [
    uniqueIndex("session_connexion_jeton_hash_unique").on(t.jetonHash),
    index("session_connexion_utilisateur_idx").on(t.utilisateurId),
  ],
);

/** Invitations : une seule en attente (ni utilisée ni annulée) par adresse. */
export const invitation = pgTable(
  "invitation",
  {
    id: uuid().defaultRandom().primaryKey(),
    email: text().notNull(),
    role: roleUtilisateur().notNull(),
    jetonHash: text().notNull(),
    // Nul : invitation créée par le script admin:creer (ou inviteur supprimé).
    invitePar: uuid().references(() => utilisateur.id, { onDelete: "set null" }),
    creeLe: timestamp({ withTimezone: true }).notNull(),
    expireLe: timestamp({ withTimezone: true }).notNull(),
    utiliseeLe: timestamp({ withTimezone: true }),
    annuleeLe: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("invitation_jeton_hash_unique").on(t.jetonHash),
    uniqueIndex("invitation_email_en_attente_unique")
      .on(t.email)
      .where(sql`${t.utiliseeLe} IS NULL AND ${t.annuleeLe} IS NULL`),
    check("invitation_email_minuscules", sql`${t.email} = lower(${t.email})`),
  ],
);

/** Liens de réinitialisation du mot de passe : usage unique, 1 h. */
export const jetonReinitialisation = pgTable(
  "jeton_reinitialisation",
  {
    id: uuid().defaultRandom().primaryKey(),
    utilisateurId: uuid()
      .notNull()
      .references(() => utilisateur.id, { onDelete: "cascade" }),
    jetonHash: text().notNull(),
    creeLe: timestamp({ withTimezone: true }).notNull(),
    expireLe: timestamp({ withTimezone: true }).notNull(),
    utiliseLe: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("jeton_reinitialisation_jeton_hash_unique").on(t.jetonHash),
    index("jeton_reinitialisation_utilisateur_idx").on(t.utilisateurId),
  ],
);

/** Paramètres de l'installation : une seule ligne (id = 1), créée par le service à la première écriture. */
export const parametres = pgTable(
  "parametres",
  {
    id: integer().primaryKey().default(1),
    // Clé Resend chiffrée (AES-256-GCM), jamais réaffichée.
    resendCleChiffree: text(),
    emailExpediteur: text(),
    nomExpediteur: text(),
    validiteInvitationJours: integer().notNull().default(7),
    // Vides à l'installation, renseignés par le super-admin (spec §9.4).
    conservationEvenementsJours: integer(),
    conservationResultatsJours: integer(),
    contactDonnees: text(),
    modifieLe: timestamp({ withTimezone: true }),
  },
  (t) => [
    check("parametres_ligne_unique", sql`${t.id} = 1`),
    check("parametres_validite_invitation", sql`${t.validiteInvitationJours} BETWEEN 1 AND 30`),
  ],
);

/** Jetons MCP des enseignants (gérés au lot 8 ; révoqués dès ce lot à la désactivation). */
export const jetonMcp = pgTable(
  "jeton_mcp",
  {
    id: uuid().defaultRandom().primaryKey(),
    enseignantId: uuid()
      .notNull()
      .references(() => utilisateur.id, { onDelete: "cascade" }),
    nom: text().notNull(),
    prefixe: text().notNull(),
    jetonHash: text().notNull(),
    portee: porteeJetonMcp().notNull(),
    creeLe: timestamp({ withTimezone: true }).notNull(),
    dernierUsageLe: timestamp({ withTimezone: true }),
    revoqueLe: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("jeton_mcp_jeton_hash_unique").on(t.jetonHash),
    index("jeton_mcp_enseignant_idx").on(t.enseignantId),
  ],
);
