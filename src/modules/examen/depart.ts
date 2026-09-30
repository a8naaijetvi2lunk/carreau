/**
 * Départ commun (spec §6.3, décisions D3 à D5 du plan du lot 5), dans la transaction de
 * `demarrerSession`, qui tient déjà la session en FOR UPDATE : instantané et fin prévue de la
 * session, puis pour chaque participation tiers-temps figé (A1), ordre (mélange par blocs), première
 * question servie au départ et échéances. Un rattrapage réutilise l'instantané de sa session
 * d'origine, copié à sa création (lot 7).
 */
import "server-only";
import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Transaction } from "@/db";
import { etudiant, participation, sessionExamen } from "@/db/schema";
import { schemaContenuSession } from "@/lib/instantane";
import { etatDeDepart, finPrevue } from "@/moteur/echeances";
import { calculerOrdre } from "@/moteur/melange";
import { instantaneDuQcm } from "@/modules/qcm";
import { chronoDe } from "./commun";

export async function preparerDepart(
  tx: Transaction,
  depart: { sessionId: string; qcmId: string; demarreLe: Date },
): Promise<{ participants: number; questions: number }> {
  // Un rattrapage garde l'instantané copié de sa session d'origine (D4 du plan du lot 7).
  const [existant] = await tx
    .select({ contenu: sessionExamen.contenu })
    .from(sessionExamen)
    .where(eq(sessionExamen.id, depart.sessionId));
  const contenu = schemaContenuSession.parse(existant?.contenu ?? (await instantaneDuQcm(tx, depart.qcmId)));
  const participants = await tx
    .select({ id: participation.id, tiersTemps: etudiant.tiersTemps })
    .from(participation)
    .innerJoin(etudiant, eq(etudiant.id, participation.etudiantId))
    .where(eq(participation.sessionId, depart.sessionId));
  await tx
    .update(sessionExamen)
    .set({
      contenu,
      finPrevueLe: finPrevue(
        contenu.modeChrono,
        contenu.dureeGlobaleS,
        contenu.questions.map((q) => q.dureeS),
        participants.some((p) => p.tiersTemps),
        depart.demarreLe,
      ),
    })
    .where(eq(sessionExamen.id, depart.sessionId));
  for (const p of participants) {
    const ordre = calculerOrdre(contenu.questions, (n) => randomInt(n));
    const etat = etatDeDepart(chronoDe(contenu, ordre, p.tiersTemps), depart.demarreLe);
    await tx
      .update(participation)
      .set({
        statut: "en_cours",
        tiersTemps: p.tiersTemps,
        ordre,
        indexCourant: 0,
        questionServieLe: etat.questionServieLe,
        echeanceQuestionLe: etat.echeanceQuestionLe,
        echeanceGlobaleLe: etat.echeanceGlobaleLe,
      })
      .where(eq(participation.id, p.id));
  }
  return { participants: participants.length, questions: contenu.questions.length };
}
