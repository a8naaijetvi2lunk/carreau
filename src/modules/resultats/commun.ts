/**
 * Lectures partagées du module resultats (plan du lot 7) : session racine d'un examen (la session
 * d'origine, jamais un rattrapage), rattrapage des passages échus de sa famille, bonnes réponses.
 */
import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, type Executeur } from "@/db";
import { classe, qcm, reponse, sessionExamen } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { erreurs } from "@/lib/erreurs";
import type { ContenuSession } from "@/lib/instantane";
import type { StatutSession } from "@/lib/regles-session";
import { rattraperSession } from "@/modules/examen";

export type RacineLue = {
  id: string;
  classeId: string;
  classe: string;
  titre: string;
  statut: StatutSession;
  contenu: ContenuSession | null;
  demarreLe: Date | null;
  termineLe: Date | null;
  noteVisible: boolean;
  correctionVisible: boolean;
};

/** Racine terminée : son instantané et son départ existent. */
export type RacineTerminee = RacineLue & { contenu: ContenuSession; demarreLe: Date };

export function estTerminee(racine: RacineLue): racine is RacineTerminee {
  return racine.statut === "terminee" && racine.contenu !== null && racine.demarreLe !== null;
}

/**
 * Racine de l'examen d'une session de l'acteur : la session elle-même, ou l'origine d'un rattrapage.
 * Session d'un autre compte : même réponse qu'une session inconnue (refus journalisé par l'appelant).
 */
export async function racineDeLActeur(
  executeur: Executeur,
  acteur: ActeurUtilisateur,
  sessionId: string,
): Promise<RacineLue> {
  const [lue] = await executeur
    .select({
      id: sessionExamen.id,
      enseignantId: sessionExamen.enseignantId,
      sessionOrigineId: sessionExamen.sessionOrigineId,
    })
    .from(sessionExamen)
    .where(eq(sessionExamen.id, sessionId));
  if (!lue) throw erreurs.introuvable("Session");
  if (lue.enseignantId !== acteur.id) throw erreurs.ressourceAutrui("Session");
  const [racine] = await executeur
    .select({
      id: sessionExamen.id,
      classeId: sessionExamen.classeId,
      classe: classe.nom,
      titreQcm: qcm.titre,
      statut: sessionExamen.statut,
      contenu: sessionExamen.contenu,
      demarreLe: sessionExamen.demarreLe,
      termineLe: sessionExamen.termineLe,
      noteVisible: sessionExamen.noteVisible,
      correctionVisible: sessionExamen.correctionVisible,
    })
    .from(sessionExamen)
    .innerJoin(classe, eq(classe.id, sessionExamen.classeId))
    .innerJoin(qcm, eq(qcm.id, sessionExamen.qcmId))
    .where(eq(sessionExamen.id, lue.sessionOrigineId ?? lue.id));
  if (!racine) throw erreurs.introuvable("Session");
  const { titreQcm, ...reste } = racine;
  return { ...reste, titre: racine.contenu?.titre ?? titreQcm };
}

/** Rattrapages en cours de la racine : passages échus rattrapés, clôture tentée (spec §6.5). */
export async function rattraperFamille(racineId: string): Promise<void> {
  const enCours = await db()
    .select({ id: sessionExamen.id })
    .from(sessionExamen)
    .where(and(eq(sessionExamen.sessionOrigineId, racineId), eq(sessionExamen.statut, "en_cours")));
  for (const { id } of enCours) await rattraperSession(id);
}

/** Bonnes réponses de chaque participation : réponses validées dont les points égalent ceux d'une bonne réponse. */
export async function bonnesReponses(
  executeur: Executeur,
  participationIds: readonly string[],
  contenu: ContenuSession,
): Promise<Map<string, number>> {
  const resultat = new Map<string, number>(participationIds.map((id) => [id, 0]));
  if (participationIds.length === 0) return resultat;
  const bareme = new Map(contenu.questions.map((q) => [q.cle, Math.round(q.pointsBonne * 100)]));
  const lignes = await executeur
    .select({ participationId: reponse.participationId, cle: reponse.questionCle, points: reponse.points })
    .from(reponse)
    .where(and(inArray(reponse.participationId, [...participationIds]), isNotNull(reponse.valideeLe)));
  for (const l of lignes) {
    if (l.points !== null && Math.round(l.points * 100) === bareme.get(l.cle)) {
      resultat.set(l.participationId, (resultat.get(l.participationId) ?? 0) + 1);
    }
  }
  return resultat;
}
