import { sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { utilisateur } from "./comptes";

/**
 * Classes (spec §4.2) : chacune appartient au compte qui l'a créée, quel que soit son rôle.
 * Jamais supprimée : archivée (décision D4 du plan du lot 2).
 */
export const classe = pgTable(
  "classe",
  {
    id: uuid().defaultRandom().primaryKey(),
    // RESTRICT : un compte se désactive, il ne se supprime pas ; une suppression n'emporte pas ses classes.
    enseignantId: uuid()
      .notNull()
      .references(() => utilisateur.id, { onDelete: "restrict" }),
    nom: text().notNull(),
    archivee: boolean().notNull().default(false),
    creeLe: timestamp({ withTimezone: true }).notNull(),
  },
  // Nom unique par compte, sans tenir compte de la casse (décision D3).
  (t) => [uniqueIndex("classe_enseignant_nom_unique").on(t.enseignantId, sql`lower(${t.nom})`)],
);

/**
 * Étudiants d'une classe (spec §4.2) : les noms normalisés (`normaliserNom` de `@/lib/noms`)
 * refusent les homonymes parfaits (décision D5).
 */
export const etudiant = pgTable(
  "etudiant",
  {
    id: uuid().defaultRandom().primaryKey(),
    classeId: uuid()
      .notNull()
      .references(() => classe.id, { onDelete: "cascade" }),
    nom: text().notNull(),
    prenom: text().notNull(),
    nomNormalise: text().notNull(),
    prenomNormalise: text().notNull(),
    tiersTemps: boolean().notNull().default(false),
    creeLe: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("etudiant_classe_nom_unique").on(t.classeId, t.nomNormalise, t.prenomNormalise)],
);
