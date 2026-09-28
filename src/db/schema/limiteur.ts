import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Compteurs du limiteur (spec §11.2), une ligne par clé (ex. « connexion:compte:<id> »,
 * « etudiant:reponse:<participation> »). Les instants viennent de l'horloge applicative.
 */
export const limiteur = pgTable("limiteur", {
  cle: text().primaryKey(),
  compteur: integer().notNull(),
  fenetreDebut: timestamp({ withTimezone: true }).notNull(),
  bloqueJusquAu: timestamp({ withTimezone: true }),
});
