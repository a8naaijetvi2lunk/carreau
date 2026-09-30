/**
 * Publication de la correction (spec §9.1 ; amendement A1 et décision D11 du plan du lot 7) : session
 * terminée avec la correction visible, et aucune session de la même famille (origine et rattrapages)
 * en salle d'attente ou en cours.
 */
import "server-only";
import { and, eq, inArray, or } from "drizzle-orm";
import type { Executeur } from "@/db";
import { sessionExamen } from "@/db/schema";

/** Vrai si la correction de cette session peut être montrée à ses étudiants (A1, D11). */
export async function correctionPubliee(executeur: Executeur, sessionId: string): Promise<boolean> {
  const [session] = await executeur
    .select({
      statut: sessionExamen.statut,
      correctionVisible: sessionExamen.correctionVisible,
      sessionOrigineId: sessionExamen.sessionOrigineId,
    })
    .from(sessionExamen)
    .where(eq(sessionExamen.id, sessionId));
  if (!session || session.statut !== "terminee" || !session.correctionVisible) return false;
  const racineId = session.sessionOrigineId ?? sessionId;
  const [ouverte] = await executeur
    .select({ id: sessionExamen.id })
    .from(sessionExamen)
    .where(
      and(
        or(eq(sessionExamen.id, racineId), eq(sessionExamen.sessionOrigineId, racineId)),
        inArray(sessionExamen.statut, ["attente", "en_cours"]),
      ),
    )
    .limit(1);
  return ouverte === undefined;
}
