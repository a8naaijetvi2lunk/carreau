import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Auteur d'une action journalisée ; « anonyme » : aucun acteur identifié (ex. échec de connexion). */
export const typeActeur = pgEnum("type_acteur", [
  "utilisateur",
  "participation",
  "jeton",
  "systeme",
  "anonyme",
]);

/** Journal d'audit (spec §4.1) : jamais de secret ni de contenu de réponse dans `details`. */
export const journal = pgTable(
  "journal",
  {
    id: uuid().defaultRandom().primaryKey(),
    acteurType: typeActeur().notNull(),
    // Polymorphe selon acteurType (utilisateur, participation ou jeton) : pas de clé étrangère.
    acteurId: uuid(),
    action: text().notNull(),
    cible: text(),
    details: jsonb().$type<Record<string, unknown>>().notNull(),
    creeLe: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [index("journal_cree_le_idx").on(table.creeLe)],
);
