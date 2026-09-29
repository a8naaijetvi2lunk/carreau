/**
 * Lectures partagées du module examen (plan du lot 5, décisions D3 et D4) : instantané complet,
 * question courante seule (extraite en SQL, pour les lectures fréquentes du téléphone) et chrono d'un
 * étudiant dans son ordre.
 */
import "server-only";
import { eq, sql } from "drizzle-orm";
import type { Executeur } from "@/db";
import { sessionExamen } from "@/db/schema";
import {
  schemaQuestionInstantanee,
  type ContenuSession,
  type OrdrePassage,
  type QuestionInstantanee,
} from "@/lib/instantane";
import type { ChronoPassage } from "@/moteur/echeances";

/** Instantané complet d'une session démarrée. */
export async function lireContenu(executeur: Executeur, sessionId: string): Promise<ContenuSession> {
  const [ligne] = await executeur
    .select({ contenu: sessionExamen.contenu })
    .from(sessionExamen)
    .where(eq(sessionExamen.id, sessionId));
  if (!ligne?.contenu) throw new Error(`Instantané absent : session:${sessionId}`);
  return ligne.contenu;
}

/**
 * Une question de l'instantané, extraite seule (`contenu -> 'questions' -> n`) : un téléphone qui
 * interroge toutes les 5 s ne relit pas tout l'instantané (D3). Une seule table : la colonne non
 * qualifiée est voulue.
 */
export async function lireQuestion(
  executeur: Executeur,
  sessionId: string,
  indexQuestion: number,
): Promise<QuestionInstantanee> {
  const [ligne] = await executeur
    .select({ question: sql<unknown>`${sessionExamen.contenu} -> 'questions' -> ${indexQuestion}::int` })
    .from(sessionExamen)
    .where(eq(sessionExamen.id, sessionId));
  return schemaQuestionInstantanee.parse(ligne?.question);
}

/** Chrono d'un étudiant : durées des questions dans SON ordre, tiers-temps figé (A1). */
export function chronoDe(contenu: ContenuSession, ordre: OrdrePassage, tiersTemps: boolean): ChronoPassage {
  return {
    modeChrono: contenu.modeChrono,
    dureeGlobaleS: contenu.dureeGlobaleS,
    dureesS: ordre.map((o) => contenu.questions[o.q]?.dureeS ?? null),
    tiersTemps,
  };
}
