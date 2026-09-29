/**
 * Brouillon et validation d'une réponse (spec §6.4 ; décisions D4, D7 et D8 du plan du lot 5) : la
 * question courante seulement, dans une transaction verrouillée, après rattrapage des échéances. Les
 * identifiants reçus sont des positions affichées (« 0 » à « 7 ») ; les sélections sont stockées en
 * index d'origine triés.
 */
import "server-only";
import { isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reponse } from "@/db/schema";
import { erreurs } from "@/lib/erreurs";
import { maintenant } from "@/lib/horloge";
import type { OrdrePassage, QuestionInstantanee } from "@/lib/instantane";
import { MESSAGES_EXAMEN } from "@/lib/regles-examen";
import { valider } from "@/lib/validation";
import { apresValidation } from "@/moteur/echeances";
import { chronoDe, lireContenu, lireQuestion } from "./commun";
import {
  cloturerSiFinie,
  ecrireReponse,
  enregistrerRattrapage,
  questionAuRang,
  rattraper,
  verrouillerPassage,
  type Passage,
} from "./passage";

export type SaisieReponse = { rang: number; selection: string[] };

const INVALIDE = { error: MESSAGES_EXAMEN.selectionInvalide };

const schemaSaisie = z.strictObject({
  rang: z.int(INVALIDE).min(1, INVALIDE).max(100, INVALIDE),
  selection: z.array(z.string(INVALIDE).regex(/^[0-7]$/, INVALIDE), INVALIDE).max(8, INVALIDE),
});

/** Positions affichées → index d'origine triés ; refus si hors bornes, en double, ou plusieurs pour un choix unique (D7). */
function selectionDOrigine(
  question: QuestionInstantanee,
  p: readonly number[],
  identifiants: readonly string[],
): number[] {
  const positions = identifiants.map(Number);
  if (new Set(positions).size !== positions.length || positions.some((k) => k >= p.length)) {
    throw erreurs.validation(MESSAGES_EXAMEN.selectionInvalide);
  }
  if (question.type !== "multiple" && positions.length > 1)
    throw erreurs.validation(MESSAGES_EXAMEN.uneSeule);
  return positions.map((k) => p[k] as number).sort((a, b) => a - b);
}

/** Passage en cours et démarré ; sinon ETAT : fini (« plus modifiable ») ou pas commencé (« pas encore ouverte »). */
function exigerOuvert(passage: Passage, instant: Date): OrdrePassage {
  if (passage.statut === "terminee") throw erreurs.etat(MESSAGES_EXAMEN.pasCourante);
  const demarre =
    passage.session.demarreLe !== null && instant.getTime() >= passage.session.demarreLe.getTime();
  if (passage.statut !== "en_cours" || !passage.ordre || !demarre)
    throw erreurs.etat(MESSAGES_EXAMEN.pasOuverte);
  return passage.ordre;
}

/** Brouillon de la question courante (D7), à chaque touche ; une réponse validée n'est jamais modifiée. */
export async function enregistrerBrouillon(participationId: string, saisie: SaisieReponse): Promise<void> {
  const donnees = valider(schemaSaisie, saisie, "Réponse");
  const instant = maintenant();
  await db().transaction(async (tx) => {
    const lu = await verrouillerPassage(tx, participationId);
    if (!lu) throw erreurs.etat(MESSAGES_EXAMEN.pasCourante);
    const passage = await rattraper(tx, lu, instant);
    const ordre = exigerOuvert(passage, instant);
    const index = passage.etat.indexCourant;
    if (donnees.rang !== index + 1) {
      throw erreurs.etat(donnees.rang <= index ? MESSAGES_EXAMEN.pasCourante : MESSAGES_EXAMEN.pasOuverte);
    }
    const entree = ordre[index];
    if (!entree) throw erreurs.etat(MESSAGES_EXAMEN.pasCourante);
    const question = await lireQuestion(tx, passage.session.id, entree.q);
    const selection = selectionDOrigine(question, entree.p, donnees.selection);
    await tx
      .insert(reponse)
      .values({ participationId, questionCle: question.cle, selectionBrouillon: selection })
      .onConflictDoUpdate({
        target: [reponse.participationId, reponse.questionCle],
        set: { selectionBrouillon: selection },
        setWhere: isNull(reponse.valideeLe),
      });
  });
}

/**
 * Validation (D8) : rang déjà passé → rien n'est écrit (idempotence) ; rang à venir → ETAT ;
 * question courante → réponse validée, points, question suivante ou fin du passage. La session est
 * ensuite close si c'était le dernier passage ouvert (autre transaction, D6).
 */
export async function validerQuestion(participationId: string, saisie: SaisieReponse): Promise<void> {
  const donnees = valider(schemaSaisie, saisie, "Réponse");
  const instant = maintenant();
  const sessionTerminee = await db().transaction(async (tx): Promise<string | null> => {
    const lu = await verrouillerPassage(tx, participationId);
    if (!lu) throw erreurs.etat(MESSAGES_EXAMEN.pasCourante);
    const passage = await rattraper(tx, lu, instant);
    if (passage.statut === "terminee") return passage.session.id;
    const ordre = exigerOuvert(passage, instant);
    const index = passage.etat.indexCourant;
    if (donnees.rang <= index) return null;
    if (donnees.rang > index + 1) throw erreurs.etat(MESSAGES_EXAMEN.pasOuverte);
    const contenu = await lireContenu(tx, passage.session.id);
    const { question, p } = questionAuRang(contenu, ordre, index);
    const selection = selectionDOrigine(question, p, donnees.selection);
    await ecrireReponse(tx, passage.id, question, selection, "validation", instant);
    const suite = apresValidation(
      passage.etat,
      chronoDe(contenu, ordre, passage.tiersTemps),
      ordre.length,
      instant,
    );
    const apres = await enregistrerRattrapage(tx, passage, contenu, suite);
    return apres.statut === "terminee" ? passage.session.id : null;
  });
  if (sessionTerminee) await cloturerSiFinie(sessionTerminee, instant);
}
