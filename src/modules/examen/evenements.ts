/**
 * Événements du téléphone (spec §8.2 ; décisions D3 et D7 du plan du lot 6) : dans la transaction
 * verrouillée du passage, rattrapage, contact, puis insertion horodatée par le serveur. Un lot renvoyé
 * (même chargement, mêmes numéros) n'est enregistré qu'une fois. Hors d'un passage en cours et
 * démarré, rien n'est enregistré : le téléphone vide sa file.
 */
import "server-only";
import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { evenement } from "@/db/schema";
import { maintenant } from "@/lib/horloge";
import {
  EVENEMENTS_MAX_PAR_PASSAGE,
  LOT_EVENEMENTS_MAX,
  MESSAGE_EVENEMENTS_INVALIDES,
  TYPES_EVENEMENT_TELEPHONE,
} from "@/lib/regles-surveillance";
import { valider } from "@/lib/validation";
import { noterContact, rattraper, verrouillerPassage } from "./passage";

const INVALIDE = { error: MESSAGE_EVENEMENTS_INVALIDES };

const schemaLot = z.strictObject(
  {
    chargement: z.string(INVALIDE).regex(/^[A-Za-z0-9_-]{8,64}$/, INVALIDE),
    evenements: z
      .array(
        z.strictObject(
          {
            n: z.int(INVALIDE).min(1, INVALIDE).max(1_000_000, INVALIDE),
            type: z.enum(TYPES_EVENEMENT_TELEPHONE, INVALIDE),
          },
          INVALIDE,
        ),
        INVALIDE,
      )
      .min(1, INVALIDE)
      .max(LOT_EVENEMENTS_MAX, INVALIDE),
  },
  INVALIDE,
);

export async function enregistrerEvenements(
  participationId: string,
  lot: { chargement: string; evenements: { n: number; type: string }[] },
): Promise<{ enregistres: number }> {
  const donnees = valider(schemaLot, lot, "Événements");
  // Un numéro en double dans le lot : le premier est gardé.
  const uniques: typeof donnees.evenements = [];
  for (const e of donnees.evenements) if (!uniques.some((u) => u.n === e.n)) uniques.push(e);
  const instant = maintenant();
  return db().transaction(async (tx) => {
    const lu = await verrouillerPassage(tx, participationId);
    if (!lu) return { enregistres: 0 };
    const passage = await noterContact(tx, await rattraper(tx, lu, instant), instant);
    const demarreLe = passage.session.demarreLe;
    if (passage.statut !== "en_cours" || demarreLe === null || instant.getTime() < demarreLe.getTime()) {
      return { enregistres: 0 };
    }
    const [deja] = await tx
      .select({ total: count() })
      .from(evenement)
      .where(eq(evenement.participationId, passage.id));
    // Les événements du serveur comptent aussi : le plafond reste une borne haute, jamais atteinte en usage normal.
    const place = EVENEMENTS_MAX_PAR_PASSAGE - (deja?.total ?? 0);
    if (place <= 0) return { enregistres: 0 };
    const inseres = await tx
      .insert(evenement)
      .values(
        uniques.slice(0, place).map((e) => ({
          participationId: passage.id,
          type: e.type,
          recuLe: instant,
          questionIndex: passage.etat.indexCourant,
          chargement: donnees.chargement,
          sequence: e.n,
        })),
      )
      .onConflictDoNothing({ target: [evenement.participationId, evenement.chargement, evenement.sequence] })
      .returning({ id: evenement.id });
    return { enregistres: inseres.length };
  });
}
