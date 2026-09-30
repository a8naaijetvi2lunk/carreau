/**
 * Correction côté étudiant (spec §9.1 et §11.1 ; amendement A1 et décision D11 du plan du lot 7) :
 * questions d'un passage terminé dans l'ordre de l'étudiant, ses réponses et les bonnes, une fois la
 * correction publiée ; images de la correction.
 */
import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { participation, reponse } from "@/db/schema";
import { resultatQuestion } from "@/lib/regles-resultats";
import type { VueCorrection } from "@/lib/vue-correction";
import { lireContenu } from "./commun";
import { passageAJour } from "./passage";
import { correctionPubliee } from "./publication";
import { vueQuestion } from "./vue";

const RESULTATS = { Juste: "juste", Faux: "faux", "Sans réponse": "vide" } as const;

/** Correction d'un passage terminé, dans l'ordre de l'étudiant ; null si elle n'est pas publiée. */
export async function correctionDuPassage(participationId: string): Promise<VueCorrection | null> {
  const passage = await passageAJour(participationId);
  const ordre = passage?.ordre;
  if (!passage || passage.statut !== "terminee" || !ordre) return null;
  if (!(await correctionPubliee(db(), passage.session.id))) return null;
  const contenu = await lireContenu(db(), passage.session.id);
  const lignes = await db()
    .select({ cle: reponse.questionCle, selection: reponse.selection, points: reponse.points })
    .from(reponse)
    .where(and(eq(reponse.participationId, participationId), isNotNull(reponse.valideeLe)));
  const parCle = new Map(lignes.map((l) => [l.cle, l]));
  return {
    note: passage.session.noteVisible ? passage.noteSur20 : null,
    questions: ordre.map((entree, index) => {
      const question = contenu.questions[entree.q];
      if (!question) throw new Error(`Question absente de l'instantané : ${entree.q}.`);
      const vue = vueQuestion(question, entree.p, index + 1, ordre.length);
      const r = parCle.get(question.cle);
      const selection = r?.selection ?? [];
      return {
        rang: index + 1,
        type: question.type,
        enonce: vue.enonce,
        image: vue.image,
        code: vue.code,
        propositions: vue.propositions.map((p, position) => {
          const origine = entree.p[position] ?? -1;
          return {
            texte: p.texte,
            image: p.image,
            correcte: question.propositions[origine]?.correcte ?? false,
            choisie: selection.includes(origine),
          };
        }),
        resultat: RESULTATS[resultatQuestion(selection, question)],
        points: r?.points ?? question.pointsVide,
        pointsBonne: question.pointsBonne,
      };
    }),
  };
}

/** Vrai si l'image est citée par une question de l'instantané et que la correction est publiée (§11.1). */
export async function imageDeLaCorrection(participationId: string, imageId: string): Promise<boolean> {
  const [p] = await db()
    .select({ sessionId: participation.sessionId, statut: participation.statut })
    .from(participation)
    .where(eq(participation.id, participationId));
  if (!p || p.statut !== "terminee" || !(await correctionPubliee(db(), p.sessionId))) return false;
  const contenu = await lireContenu(db(), p.sessionId);
  return contenu.questions.some(
    (q) => q.image?.id === imageId || q.propositions.some((x) => x.image?.id === imageId),
  );
}
