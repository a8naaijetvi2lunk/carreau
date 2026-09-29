import { index, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { utilisateur } from "./comptes";

/**
 * Images téléversées (spec §4.2, décision D14 du plan du lot 3) : fichier `IMAGES_DIR/<id>.webp`,
 * ré-encodé. L'identifiant est tiré par le service (le fichier est écrit avant la ligne). Jamais
 * supprimées au lot 3 : un instantané de session pourra les citer (lot 5).
 */
export const image = pgTable(
  "image",
  {
    id: uuid().primaryKey(),
    // RESTRICT : un compte se désactive, il ne se supprime pas.
    enseignantId: uuid()
      .notNull()
      .references(() => utilisateur.id, { onDelete: "restrict" }),
    largeur: integer().notNull(),
    hauteur: integer().notNull(),
    octets: integer().notNull(),
    creeLe: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [index("image_enseignant_idx").on(t.enseignantId)],
);
