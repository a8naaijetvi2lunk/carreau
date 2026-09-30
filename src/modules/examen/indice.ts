/**
 * Indice des passages (spec §8.4 ; décisions D5 et D9 du plan du lot 6) : lecture des événements
 * bruts et des validations, puis calcul par le moteur. L'indice n'est écrit en base qu'à la fin d'un
 * passage ; il reste recalculable à tout moment à partir des événements.
 */
import "server-only";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import type { Executeur } from "@/db";
import { evenement, reponse } from "@/db/schema";
import { calculerIndice, consolider, type EvenementBrut, type Indice } from "@/moteur/indice";

/** Événements bruts de ces participations, par participation, dans l'ordre de réception. */
export async function evenementsBruts(
  executeur: Executeur,
  participationIds: readonly string[],
): Promise<Map<string, EvenementBrut[]>> {
  const parParticipation = new Map<string, EvenementBrut[]>(participationIds.map((id) => [id, []]));
  if (participationIds.length === 0) return parParticipation;
  const lignes = await executeur
    .select({
      participationId: evenement.participationId,
      type: evenement.type,
      recuLe: evenement.recuLe,
      dureeMs: evenement.dureeMs,
      questionIndex: evenement.questionIndex,
      chargement: evenement.chargement,
      sequence: evenement.sequence,
    })
    .from(evenement)
    .where(inArray(evenement.participationId, [...participationIds]))
    .orderBy(asc(evenement.recuLe), asc(evenement.id));
  for (const { participationId, ...brut } of lignes) parParticipation.get(participationId)?.push(brut);
  return parParticipation;
}

/** Heures des réponses validées par l'étudiant lui-même (pas celles closes par le serveur). */
export async function validationsDe(
  executeur: Executeur,
  participationIds: readonly string[],
): Promise<Map<string, Date[]>> {
  const parParticipation = new Map<string, Date[]>(participationIds.map((id) => [id, []]));
  if (participationIds.length === 0) return parParticipation;
  const lignes = await executeur
    .select({ participationId: reponse.participationId, valideeLe: reponse.valideeLe })
    .from(reponse)
    .where(
      and(
        inArray(reponse.participationId, [...participationIds]),
        eq(reponse.origine, "validation"),
        isNotNull(reponse.valideeLe),
      ),
    );
  for (const l of lignes) if (l.valideeLe) parParticipation.get(l.participationId)?.push(l.valideeLe);
  return parParticipation;
}

/** Indice d'un passage terminé à `fin` (D9). */
export async function indiceFinal(executeur: Executeur, participationId: string, fin: Date): Promise<Indice> {
  const evenements = (await evenementsBruts(executeur, [participationId])).get(participationId) ?? [];
  const validations = (await validationsDe(executeur, [participationId])).get(participationId) ?? [];
  return calculerIndice(consolider(evenements, fin), validations);
}
