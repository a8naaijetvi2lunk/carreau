/**
 * Indice des passages (spec §8.4 ; décisions D5 et D9 du plan du lot 6) : lecture des événements
 * bruts et des validations, puis calcul par le moteur. L'indice n'est écrit en base qu'à la fin d'un
 * passage ; il reste recalculable à tout moment à partir des événements.
 */
import "server-only";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import type { Executeur } from "@/db";
import { evenement, participation, reponse, sessionExamen } from "@/db/schema";
import {
  BANDEAU_SORTIE_MIN_MS,
  BANDEAU_SORTIE_MS,
  SEUIL_SILENCE_MS,
  type Fait,
} from "@/lib/regles-surveillance";
import { calculerIndice, consolider, faitsNotables, type EvenementBrut, type Indice } from "@/moteur/indice";

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

/** Indice, faits notables et silence en cours d'un passage, vus du tableau de bord (D9, D10). */
export type SurveillancePassage = { indice: number | null; faits: Fait[]; deconnecte: boolean };

/**
 * Surveillance de toute une session à `instant` (D9) : une requête des événements, une des
 * validations, puis le moteur pour chaque participant. Un passage en cours muet depuis plus de 15 s
 * reçoit un silence provisoire jusqu'à `instant`, jamais écrit en base. Avant le départ : rien.
 */
export async function surveillanceDeLaSession(
  executeur: Executeur,
  sessionId: string,
  instant: Date,
): Promise<Map<string, SurveillancePassage>> {
  const [session] = await executeur
    .select({ demarreLe: sessionExamen.demarreLe })
    .from(sessionExamen)
    .where(eq(sessionExamen.id, sessionId));
  const passages = await executeur
    .select({
      id: participation.id,
      statut: participation.statut,
      dernierContactLe: participation.dernierContactLe,
      termineeLe: participation.termineeLe,
      indexCourant: participation.indexCourant,
    })
    .from(participation)
    .where(eq(participation.sessionId, sessionId));
  const resultat = new Map<string, SurveillancePassage>();
  const demarreLe = session?.demarreLe ?? null;
  if (demarreLe === null || instant.getTime() < demarreLe.getTime()) {
    for (const p of passages) resultat.set(p.id, { indice: null, faits: [], deconnecte: false });
    return resultat;
  }
  const ids = passages.map((p) => p.id);
  const evenements = await evenementsBruts(executeur, ids);
  const validations = await validationsDe(executeur, ids);
  for (const p of passages) {
    const bruts = evenements.get(p.id) ?? [];
    let deconnecte = false;
    if (p.statut === "en_cours") {
      const ecart = instant.getTime() - Math.max(p.dernierContactLe.getTime(), demarreLe.getTime());
      deconnecte = ecart > SEUIL_SILENCE_MS;
      if (deconnecte) {
        bruts.push({
          type: "silence",
          recuLe: instant,
          dureeMs: ecart,
          questionIndex: p.indexCourant,
          chargement: null,
          sequence: null,
        });
      }
    }
    const consolidation = consolider(bruts, p.termineeLe ?? instant);
    resultat.set(p.id, {
      indice:
        p.statut === "attente" ? null : calculerIndice(consolidation, validations.get(p.id) ?? []).valeur,
      faits: faitsNotables(consolidation),
      deconnecte,
    });
  }
  return resultat;
}

/** Dernière sortie consolidée d'au moins 2 s, finie depuis moins de 30 s (bandeau du téléphone, D15). */
export async function sortieRecente(
  executeur: Executeur,
  participationId: string,
  instant: Date,
): Promise<{ dureeS: number } | null> {
  const bruts = (await evenementsBruts(executeur, [participationId])).get(participationId) ?? [];
  const derniere = consolider(bruts, instant).sorties.at(-1);
  if (!derniere || derniere.dureeMs < BANDEAU_SORTIE_MIN_MS) return null;
  if (instant.getTime() - derniere.fin.getTime() >= BANDEAU_SORTIE_MS) return null;
  return { dureeS: Math.round(derniere.dureeMs / 1000) };
}
