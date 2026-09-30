/**
 * Passage d'un étudiant (spec §6.5 et §6.6 ; décisions D2, D6, D9 et D10 du plan du lot 5) :
 * lecture verrouillée (session en FOR SHARE, puis participation en FOR UPDATE), rattrapage des
 * échéances, réponses closes par le serveur, note de fin, clôture de la session.
 */
import "server-only";
import { and, count, eq, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import { db, type Transaction } from "@/db";
import { evenement, participation, reponse, sessionExamen } from "@/db/schema";
import { maintenant } from "@/lib/horloge";
import type { ContenuSession, OrdrePassage, QuestionInstantanee } from "@/lib/instantane";
import { DELAI_CLOTURE_MS, TOLERANCE_ECHEANCE_MS, type OrigineReponse } from "@/lib/regles-examen";
import { SEUIL_SILENCE_MS } from "@/lib/regles-surveillance";
import type { StatutParticipation, StatutSession } from "@/lib/regles-session";
import { appliquer, echue, terminer, type EtatPassage, type Rattrapage } from "@/moteur/echeances";
import { noter, pointsQuestion } from "@/moteur/notation";
import { journaliser } from "@/modules/journal";
import { chronoDe, lireContenu } from "./commun";
import { indiceFinal } from "./indice";

export type SessionDuPassage = {
  id: string;
  statut: StatutSession;
  demarreLe: Date | null;
  noteVisible: boolean;
};

export type Passage = {
  id: string;
  session: SessionDuPassage;
  statut: StatutParticipation;
  tiersTemps: boolean;
  ordre: OrdrePassage | null;
  etat: EtatPassage;
  noteSur20: number | null;
  dernierContactLe: Date;
};

const COLONNES_PASSAGE = {
  id: participation.id,
  statut: participation.statut,
  tiersTemps: participation.tiersTemps,
  ordre: participation.ordre,
  indexCourant: participation.indexCourant,
  questionServieLe: participation.questionServieLe,
  echeanceQuestionLe: participation.echeanceQuestionLe,
  echeanceGlobaleLe: participation.echeanceGlobaleLe,
  termineeLe: participation.termineeLe,
  noteSur20: participation.noteSur20,
  dernierContactLe: participation.dernierContactLe,
};

const COLONNES_SESSION = {
  id: sessionExamen.id,
  statut: sessionExamen.statut,
  demarreLe: sessionExamen.demarreLe,
  noteVisible: sessionExamen.noteVisible,
};

async function participationVerrouillee(
  tx: Transaction,
  participationId: string,
  session: SessionDuPassage,
): Promise<Passage | null> {
  const [l] = await tx
    .select(COLONNES_PASSAGE)
    .from(participation)
    .where(eq(participation.id, participationId))
    .for("update");
  if (!l) return null;
  return {
    id: l.id,
    session,
    statut: l.statut,
    tiersTemps: l.tiersTemps,
    ordre: l.ordre,
    noteSur20: l.noteSur20,
    dernierContactLe: l.dernierContactLe,
    etat: {
      indexCourant: l.indexCourant,
      questionServieLe: l.questionServieLe,
      echeanceQuestionLe: l.echeanceQuestionLe,
      echeanceGlobaleLe: l.echeanceGlobaleLe,
      termineeLe: l.termineeLe,
    },
  };
}

/** Passage verrouillé dans l'ordre des verrous (D6) ; null si la participation n'existe plus. */
export async function verrouillerPassage(tx: Transaction, participationId: string): Promise<Passage | null> {
  const [lien] = await tx
    .select({ sessionId: participation.sessionId })
    .from(participation)
    .where(eq(participation.id, participationId));
  if (!lien) return null;
  const [session] = await tx
    .select(COLONNES_SESSION)
    .from(sessionExamen)
    .where(eq(sessionExamen.id, lien.sessionId))
    .for("share");
  if (!session) return null;
  return participationVerrouillee(tx, participationId, session);
}

/** Écart depuis le dernier contact (ou le départ, s'il est plus récent) ; null avant le départ. */
function ecartDepuisContact(passage: Passage, instant: Date): number | null {
  const demarreLe = passage.session.demarreLe;
  if (demarreLe === null || instant.getTime() < demarreLe.getTime()) return null;
  return instant.getTime() - Math.max(passage.dernierContactLe.getTime(), demarreLe.getTime());
}

async function insererSilence(
  tx: Transaction,
  passage: Passage,
  instant: Date,
  ecart: number,
): Promise<void> {
  await tx.insert(evenement).values({
    participationId: passage.id,
    type: "silence",
    recuLe: instant,
    dureeMs: ecart,
    questionIndex: passage.etat.indexCourant,
  });
}

/**
 * Contact du téléphone à `instant` (spec §8.2 et §8.3, décisions D3 et correctif de la tâche 3 du plan
 * du lot 6) : pendant l'examen, un écart de plus de 15 s depuis le contact précédent (ou le départ) est
 * enregistré comme silence, mesuré par le serveur. Le dernier contact écrit ensuite est le plus récent
 * de l'ancien et de `instant` : une requête plus ancienne, servie après une plus récente (verrou obtenu
 * en retard), ne fait jamais reculer `dernier_contact_le`.
 */
export async function noterContact(tx: Transaction, passage: Passage, instant: Date): Promise<Passage> {
  const ecart = passage.statut === "en_cours" ? ecartDepuisContact(passage, instant) : null;
  if (ecart !== null && ecart > SEUIL_SILENCE_MS) await insererSilence(tx, passage, instant, ecart);
  const dernierContactLe =
    instant.getTime() > passage.dernierContactLe.getTime() ? instant : passage.dernierContactLe;
  await tx.update(participation).set({ dernierContactLe }).where(eq(participation.id, passage.id));
  return { ...passage, dernierContactLe };
}

/** Question au rang `index` (0…) de l'étudiant, et l'ordre affiché de ses réponses. */
export function questionAuRang(
  contenu: ContenuSession,
  ordre: OrdrePassage,
  index: number,
): { question: QuestionInstantanee; p: number[] } {
  const entree = ordre[index];
  const question = entree ? contenu.questions[entree.q] : undefined;
  if (!entree || !question) throw new Error(`Question absente au rang ${index + 1}.`);
  return { question, p: entree.p };
}

/** Écrit une réponse validée (points calculés sur l'instantané), sans jamais remplacer une réponse déjà validée. */
export async function ecrireReponse(
  tx: Transaction,
  participationId: string,
  question: QuestionInstantanee,
  selection: number[],
  origine: OrigineReponse,
  le: Date,
): Promise<void> {
  const points = pointsQuestion(question, selection);
  await tx
    .insert(reponse)
    .values({ participationId, questionCle: question.cle, selection, valideeLe: le, origine, points })
    .onConflictDoUpdate({
      target: [reponse.participationId, reponse.questionCle],
      set: { selection, valideeLe: le, origine, points },
      setWhere: isNull(reponse.valideeLe),
    });
}

/**
 * Enregistre un rattrapage du moteur : réponses closes (dernière sélection pour « echeance », aucune
 * case pour « fin »), nouvel état, et note si le passage est terminé (D9).
 */
export async function enregistrerRattrapage(
  tx: Transaction,
  passage: Passage,
  contenu: ContenuSession,
  rattrapage: Rattrapage,
): Promise<Passage> {
  const ordre = passage.ordre;
  if (!ordre) throw new Error(`Ordre absent : participation:${passage.id}`);
  if (rattrapage.clotures.length > 0) {
    const lignes = await tx
      .select({ cle: reponse.questionCle, brouillon: reponse.selectionBrouillon })
      .from(reponse)
      .where(eq(reponse.participationId, passage.id));
    const brouillons = new Map(lignes.map((l) => [l.cle, l.brouillon ?? []]));
    for (const cloture of rattrapage.clotures) {
      const { question } = questionAuRang(contenu, ordre, cloture.index);
      const selection = cloture.origine === "fin" ? [] : (brouillons.get(question.cle) ?? []);
      await ecrireReponse(tx, passage.id, question, selection, cloture.origine, cloture.le);
    }
  }
  const { etat } = rattrapage;
  const colonnes = {
    indexCourant: etat.indexCourant,
    questionServieLe: etat.questionServieLe,
    echeanceQuestionLe: etat.echeanceQuestionLe,
    termineeLe: etat.termineeLe,
  };
  if (etat.termineeLe === null) {
    await tx.update(participation).set(colonnes).where(eq(participation.id, passage.id));
    return { ...passage, etat };
  }
  // Téléphone muet jusqu'à la fin (D3) : le silence est enregistré avant l'indice final.
  const ecartFinal = ecartDepuisContact(passage, etat.termineeLe);
  if (ecartFinal !== null && ecartFinal > SEUIL_SILENCE_MS) {
    await insererSilence(tx, passage, etat.termineeLe, ecartFinal);
  }
  const validees = await tx
    .select({ points: reponse.points })
    .from(reponse)
    .where(and(eq(reponse.participationId, passage.id), isNotNull(reponse.valideeLe)));
  const { total, note } = noter(
    validees.map((v) => v.points ?? 0),
    contenu.questions.reduce((somme, q) => somme + q.pointsBonne, 0),
  );
  const indice = await indiceFinal(tx, passage.id, etat.termineeLe);
  await tx
    .update(participation)
    .set({
      ...colonnes,
      statut: "terminee",
      points: total,
      noteSur20: note,
      indice: indice.valeur,
      indiceVersion: indice.version,
      indiceDetail: indice.detail,
    })
    .where(eq(participation.id, passage.id));
  return { ...passage, statut: "terminee", etat, noteSur20: note };
}

/**
 * Rattrapage d'un passage verrouillé à `instant` (spec §6.5, A3). L'instantané n'est lu que si une
 * échéance est échue ; un passage terminé, en attente ou sans ordre n'est pas touché.
 */
export async function rattraper(tx: Transaction, passage: Passage, instant: Date): Promise<Passage> {
  if (passage.statut !== "en_cours" || !passage.ordre) return passage;
  if (!echue(passage.etat.echeanceQuestionLe, instant) && !echue(passage.etat.echeanceGlobaleLe, instant)) {
    return passage;
  }
  const contenu = await lireContenu(tx, passage.session.id);
  const chrono = chronoDe(contenu, passage.ordre, passage.tiersTemps);
  return enregistrerRattrapage(
    tx,
    passage,
    contenu,
    appliquer(passage.etat, chrono, passage.ordre.length, instant),
  );
}

/**
 * Passage verrouillé puis rattrapé, dans sa propre transaction ; null si la participation n'existe
 * plus. `contact` : la requête vient du téléphone, le contact est noté (D3 du plan du lot 6).
 */
export async function passageAJour(
  participationId: string,
  instant: Date = maintenant(),
  contact = false,
): Promise<Passage | null> {
  return db().transaction(async (tx) => {
    const lu = await verrouillerPassage(tx, participationId);
    if (!lu) return null;
    const passage = await rattraper(tx, lu, instant);
    return contact ? noterContact(tx, passage, instant) : passage;
  });
}

/**
 * Clôture d'une session en cours (spec §6.5, D10) : toutes ses participations terminées, ou fin
 * prévue passée de 10 min (les passages encore ouverts sont alors rattrapés, puis terminés à cet
 * instant). Session en FOR UPDATE, puis participations : jamais appelée depuis une transaction qui
 * tient déjà une participation. Vrai si la session vient d'être close.
 */
export async function cloturerSiFinie(sessionId: string, instant: Date = maintenant()): Promise<boolean> {
  return db().transaction(async (tx) => {
    const [session] = await tx
      .select({ ...COLONNES_SESSION, finPrevueLe: sessionExamen.finPrevueLe })
      .from(sessionExamen)
      .where(eq(sessionExamen.id, sessionId))
      .for("update");
    if (!session || session.statut !== "en_cours") return false;
    const ouvertes = await tx
      .select({ id: participation.id })
      .from(participation)
      .where(and(eq(participation.sessionId, sessionId), ne(participation.statut, "terminee")));
    const depassee =
      session.finPrevueLe !== null && instant.getTime() > session.finPrevueLe.getTime() + DELAI_CLOTURE_MS;
    if (ouvertes.length > 0 && !depassee) return false;
    if (ouvertes.length > 0) {
      const contenu = await lireContenu(tx, sessionId);
      for (const { id } of ouvertes) {
        const lu = await participationVerrouillee(tx, id, session);
        if (!lu) continue;
        const rattrape = await rattraper(tx, lu, instant);
        if (rattrape.statut === "en_cours" && rattrape.ordre) {
          await enregistrerRattrapage(
            tx,
            rattrape,
            contenu,
            terminer(rattrape.etat, rattrape.ordre.length, instant),
          );
        }
      }
    }
    const [participants] = await tx
      .select({ total: count() })
      .from(participation)
      .where(eq(participation.sessionId, sessionId));
    await tx
      .update(sessionExamen)
      .set({ statut: "terminee", termineLe: instant })
      .where(eq(sessionExamen.id, sessionId));
    await journaliser(
      {
        acteur: { type: "systeme" },
        action: "examen.cloturer_session",
        cible: `session:${sessionId}`,
        details: { participants: participants?.total ?? 0 },
      },
      tx,
    );
    return true;
  });
}

/**
 * Rattrape les passages échus d'une session (suivi de l'enseignant, D6) : préfiltre en SQL sur les
 * échéances échues (tolérance comprise), un passage par transaction, puis tentative de clôture.
 */
export async function rattraperSession(sessionId: string): Promise<void> {
  const instant = maintenant();
  const limite = new Date(instant.getTime() - TOLERANCE_ECHEANCE_MS);
  const echus = await db()
    .select({ id: participation.id })
    .from(participation)
    .where(
      and(
        eq(participation.sessionId, sessionId),
        eq(participation.statut, "en_cours"),
        or(lt(participation.echeanceQuestionLe, limite), lt(participation.echeanceGlobaleLe, limite)),
      ),
    );
  for (const { id } of echus) await passageAJour(id, instant);
  await cloturerSiFinie(sessionId, instant);
}
