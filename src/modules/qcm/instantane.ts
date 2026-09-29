/**
 * Instantané d'un QCM pour sa session (spec §4.3, décision D3 du plan du lot 5) : QCM complet
 * (bonnes réponses, barème, durées effectives), code coloré une fois pour toutes. Sans contrôle
 * d'accès : l'appelant (démarrage d'une session de l'acteur) a vérifié la propriété.
 */
import "server-only";
import { eq } from "drizzle-orm";
import type { Executeur } from "@/db";
import { qcm } from "@/db/schema";
import { erreurs } from "@/lib/erreurs";
import { schemaContenuSession, type ContenuSession } from "@/lib/instantane";
import { LANGAGES_CODE } from "@/lib/regles-qcm";
import { colorerCode } from "./code";
import { chargerQuestions } from "./commun";

export async function instantaneDuQcm(executeur: Executeur, qcmId: string): Promise<ContenuSession> {
  const [lu] = await executeur
    .select({
      titre: qcm.titre,
      modeChrono: qcm.modeChrono,
      dureeGlobaleS: qcm.dureeGlobaleS,
      dureeQuestionS: qcm.dureeQuestionS,
    })
    .from(qcm)
    .where(eq(qcm.id, qcmId));
  if (!lu) throw erreurs.introuvable("QCM");
  const questions = await chargerQuestions(executeur, qcmId);
  return schemaContenuSession.parse({
    version: 1,
    titre: lu.titre,
    modeChrono: lu.modeChrono,
    dureeGlobaleS: lu.modeChrono === "global" ? lu.dureeGlobaleS : null,
    questions: questions.map((q) => ({
      cle: q.id,
      type: q.type,
      enonce: q.enonce,
      image: q.image,
      code: q.code
        ? { libelle: LANGAGES_CODE[q.code.langage], lignes: colorerCode(q.code.langage, q.code.source) }
        : null,
      propositions: q.propositions.map((p) => ({ texte: p.texte, image: p.image, correcte: p.correcte })),
      pointsBonne: q.pointsBonne,
      pointsMauvaise: q.pointsMauvaise,
      pointsVide: q.pointsVide,
      dureeS: lu.modeChrono === "par_question" ? (q.dureeS ?? lu.dureeQuestionS) : null,
      lieeASuivante: q.lieeASuivante,
    })),
  });
}
