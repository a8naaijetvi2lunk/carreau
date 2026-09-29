/**
 * Aperçu étudiant d'un QCM (spec §9.1 ; décision D18 du plan du lot 3) : chaque question telle que la
 * verra l'étudiant, dans l'ordre du QCM, code coloré, sans l'indicateur de bonne réponse. Ouvert quel
 * que soit le statut.
 */
import "server-only";
import { z } from "zod";
import { db } from "@/db";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { urlImage, type ImageVue } from "@/lib/images";
import { LANGAGES_CODE, type ModeChrono } from "@/lib/regles-qcm";
import { lireIdentifiant, valider } from "@/lib/validation";
import type { ImageAffichee, VueQuestion } from "@/lib/vue-question";
import { journaliserLesRefus } from "@/modules/journal";
import { colorerCode } from "./code";
import { chargerQuestions, qcmDeLActeur } from "./commun";

export type ApercuQcm = {
  id: string;
  titre: string;
  modeChrono: ModeChrono;
  dureeGlobaleS: number | null;
  /** `dureeS` : durée affichée d'une question en chrono par question ; null dans les autres modes. */
  questions: { vue: VueQuestion; dureeS: number | null }[];
};

const schemaQcm = z.strictObject({ qcmId: z.string() });

function affichee(image: ImageVue | null): ImageAffichee | null {
  return image ? { url: urlImage(image.id), largeur: image.largeur, hauteur: image.hauteur } : null;
}

export async function apercuQcm(acteur: ActeurUtilisateur, saisie: { qcmId: string }): Promise<ApercuQcm> {
  return journaliserLesRefus(acteur, "qcm.apercu", async () => {
    const qcmId = lireIdentifiant(valider(schemaQcm, saisie, "QCM").qcmId, "QCM");
    const lu = await qcmDeLActeur(db(), acteur, qcmId);
    const questions = await chargerQuestions(db(), qcmId);
    return {
      id: lu.id,
      titre: lu.titre,
      modeChrono: lu.modeChrono,
      dureeGlobaleS: lu.dureeGlobaleS,
      questions: questions.map((q, index) => ({
        vue: {
          rang: index + 1,
          total: questions.length,
          type: q.type,
          enonce: q.enonce,
          image: affichee(q.image),
          code: q.code
            ? { libelle: LANGAGES_CODE[q.code.langage], lignes: colorerCode(q.code.langage, q.code.source) }
            : null,
          propositions: q.propositions.map((p, position) => ({
            id: `${q.id}:${position + 1}`,
            texte: p.texte,
            image: affichee(p.image),
          })),
        },
        dureeS: lu.modeChrono === "par_question" ? (q.dureeS ?? lu.dureeQuestionS) : null,
      })),
    };
  });
}
