/**
 * Résultats d'un examen (spec §9.1 ; décisions D5 et D6 du plan du lot 7) : liste des examens
 * terminés, tableau de la session d'origine et de ses rattrapages, visibilité de la note et de la
 * correction. Les passages échus des rattrapages en cours sont rattrapés avant toute lecture (§6.5).
 */
import "server-only";
import { and, count, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Executeur } from "@/db";
import { classe, etudiant, participation, qcm, sessionExamen } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { comparerLignes, mediane, moyenne, SEUIL_INDICE_ELEVE } from "@/lib/regles-resultats";
import { resumerExamen } from "@/lib/resume-examen";
import { lireIdentifiant, valider } from "@/lib/validation";
import type { LigneResultat, ResultatsSession, ResumeResultats, VueResultats } from "@/lib/vue-resultats";
import { journaliser, journaliserLesRefus } from "@/modules/journal";
import { situationsExamen } from "@/modules/sessions";
import {
  bonnesReponses,
  estTerminee,
  racineDeLActeur,
  rattraperFamille,
  type RacineTerminee,
} from "./commun";

const schemaSession = z.strictObject({ sessionId: z.string() });
const REGLAGE = { error: "Réglage invalide." };
const schemaVisibilite = z.strictObject({
  sessionId: z.string(),
  noteVisible: z.boolean(REGLAGE),
  correctionVisible: z.boolean(REGLAGE),
});

function secondesEntre(debut: Date, fin: Date): number {
  return Math.max(0, Math.round((fin.getTime() - debut.getTime()) / 1000));
}

/** Tableau d'une racine terminée (D5) : une ligne par étudiant actuel de la classe, et les statistiques. */
export async function construireResultats(
  executeur: Executeur,
  racine: RacineTerminee,
): Promise<VueResultats> {
  const famille = await executeur
    .select({
      id: sessionExamen.id,
      type: sessionExamen.type,
      statut: sessionExamen.statut,
      demarreLe: sessionExamen.demarreLe,
    })
    .from(sessionExamen)
    .where(or(eq(sessionExamen.id, racine.id), eq(sessionExamen.sessionOrigineId, racine.id)));
  const sessions = new Map(famille.map((s) => [s.id, s]));
  const eleves = await executeur
    .select({ id: etudiant.id, nom: etudiant.nom, prenom: etudiant.prenom, tiersTemps: etudiant.tiersTemps })
    .from(etudiant)
    .where(eq(etudiant.classeId, racine.classeId));
  const situations = await situationsExamen(executeur, { id: racine.id, classeId: racine.classeId });
  const passages = await executeur
    .select({
      id: participation.id,
      tiersTemps: participation.tiersTemps,
      statut: participation.statut,
      noteSur20: participation.noteSur20,
      points: participation.points,
      indice: participation.indice,
      termineeLe: participation.termineeLe,
    })
    .from(participation)
    .where(
      inArray(
        participation.sessionId,
        famille.map((s) => s.id),
      ),
    );
  const parId = new Map(passages.map((p) => [p.id, p]));
  const bonnes = await bonnesReponses(
    executeur,
    passages.filter((p) => p.statut === "terminee").map((p) => p.id),
    racine.contenu,
  );
  const lignes = eleves.map((e): LigneResultat => {
    const base: LigneResultat = {
      etudiantId: e.id,
      nom: e.nom,
      prenom: e.prenom,
      tiersTemps: e.tiersTemps,
      statut: "absent",
      participationId: null,
      passage: null,
      rattrapageLe: null,
      note: null,
      points: null,
      bonnes: null,
      dureeS: null,
      indice: null,
      rattrapagePrevu: null,
    };
    const situation = situations.get(e.id);
    if (!situation || situation.etat === "absent") return base;
    if (situation.etat === "prevu") {
      return {
        ...base,
        rattrapagePrevu: {
          sessionId: situation.sessionId,
          statut: situation.statut,
          creneauPrevuLe: situation.creneauPrevuLe?.toISOString() ?? null,
        },
      };
    }
    const session = sessions.get(situation.sessionId);
    const p = parId.get(situation.participationId);
    const enRattrapage = session?.type === "rattrapage";
    const commun: LigneResultat = {
      ...base,
      tiersTemps: p?.tiersTemps ?? e.tiersTemps,
      participationId: situation.participationId,
      passage: enRattrapage ? "rattrapage" : "session",
      rattrapageLe: enRattrapage ? (session?.demarreLe?.toISOString() ?? null) : null,
    };
    if (!p || p.statut !== "terminee") return { ...commun, statut: "en_cours" };
    const demarreLe = session?.demarreLe ?? null;
    return {
      ...commun,
      statut: "present",
      note: p.noteSur20,
      points: p.points,
      bonnes: bonnes.get(p.id) ?? 0,
      dureeS: demarreLe && p.termineeLe ? secondesEntre(demarreLe, p.termineeLe) : null,
      indice: p.indice,
    };
  });
  const presents = lignes.filter((l) => l.statut === "present");
  const notes = presents.flatMap((l) => (l.note === null ? [] : [l.note]));
  return {
    sessionId: racine.id,
    titre: racine.titre,
    classe: racine.classe,
    demarreLe: racine.demarreLe.toISOString(),
    duree: resumerExamen(
      {
        modeChrono: racine.contenu.modeChrono,
        dureeGlobaleS: racine.contenu.dureeGlobaleS,
        dureeQuestionS: null,
        questions: racine.contenu.questions,
      },
      false,
    ).duree,
    questions: racine.contenu.questions.length,
    noteVisible: racine.noteVisible,
    correctionVisible: racine.correctionVisible,
    rattrapageOuvert: famille.some(
      (s) => s.type === "rattrapage" && (s.statut === "attente" || s.statut === "en_cours"),
    ),
    statistiques: {
      moyenne: moyenne(notes),
      mediane: mediane(notes),
      presents: presents.length,
      effectif: lignes.length,
      indicesEleves: presents.filter((l) => (l.indice ?? 0) >= SEUIL_INDICE_ELEVE).length,
    },
    lignes: lignes.sort(comparerLignes),
  };
}

/** Tableau des résultats d'une session de l'acteur (D5) ; un rattrapage désigne sa session d'origine. */
export async function lireResultats(
  acteur: ActeurUtilisateur,
  saisie: { sessionId: string },
): Promise<ResultatsSession> {
  return journaliserLesRefus(acteur, "resultats.lire", async () => {
    const sessionId = lireIdentifiant(valider(schemaSession, saisie, "Session").sessionId, "Session");
    const racine = await racineDeLActeur(db(), acteur, sessionId);
    if (!estTerminee(racine)) {
      return {
        disponible: false,
        sessionId: racine.id,
        titre: racine.titre,
        classe: racine.classe,
        statut: racine.statut,
      };
    }
    await rattraperFamille(racine.id);
    return { disponible: true, vue: await construireResultats(db(), racine) };
  });
}

/** Examens terminés de l'acteur (sessions d'origine), du plus récent au plus ancien, rattrapages compris. */
export async function listerResultats(acteur: ActeurUtilisateur): Promise<ResumeResultats[]> {
  return journaliserLesRefus(acteur, "resultats.lister", async () => {
    const sessions = await db()
      .select({
        id: sessionExamen.id,
        titre: sql<string>`coalesce(${sessionExamen.contenu} ->> 'titre', ${qcm.titre})`,
        classe: classe.nom,
        classeId: sessionExamen.classeId,
        demarreLe: sessionExamen.demarreLe,
        termineLe: sessionExamen.termineLe,
      })
      .from(sessionExamen)
      .innerJoin(classe, eq(classe.id, sessionExamen.classeId))
      .innerJoin(qcm, eq(qcm.id, sessionExamen.qcmId))
      .where(
        and(
          eq(sessionExamen.enseignantId, acteur.id),
          eq(sessionExamen.type, "classe"),
          eq(sessionExamen.statut, "terminee"),
        ),
      );
    if (sessions.length === 0) return [];
    // Requête avec jointure : les colonnes du coalesce restent qualifiées (piège DevBrain).
    const passages = await db()
      .select({
        racineId: sql<string>`coalesce(${sessionExamen.sessionOrigineId}, ${sessionExamen.id})`,
        note: participation.noteSur20,
      })
      .from(participation)
      .innerJoin(sessionExamen, eq(sessionExamen.id, participation.sessionId))
      .where(and(eq(sessionExamen.enseignantId, acteur.id), eq(participation.statut, "terminee")));
    const effectifs = await db()
      .select({ classeId: etudiant.classeId, total: count() })
      .from(etudiant)
      .where(inArray(etudiant.classeId, [...new Set(sessions.map((s) => s.classeId))]))
      .groupBy(etudiant.classeId);
    const effectifDe = new Map(effectifs.map((e) => [e.classeId, e.total]));
    return sessions
      .flatMap((s): ResumeResultats[] => {
        // Une session terminée a toujours démarré : le filtre ne sert qu'au typage.
        if (s.demarreLe === null || s.termineLe === null) return [];
        const notes = passages
          .filter((p) => p.racineId === s.id)
          .flatMap((p) => (p.note === null ? [] : [p.note]));
        return [
          {
            sessionId: s.id,
            titre: s.titre,
            classe: s.classe,
            demarreLe: s.demarreLe.toISOString(),
            termineLe: s.termineLe.toISOString(),
            presents: notes.length,
            effectif: effectifDe.get(s.classeId) ?? 0,
            moyenne: moyenne(notes),
          },
        ];
      })
      .sort((a, b) => b.termineLe.localeCompare(a.termineLe));
  });
}

/** Visibilité de la note et de la correction (D6) : la session d'origine et tous ses rattrapages. */
export async function reglerVisibilite(
  acteur: ActeurUtilisateur,
  saisie: { sessionId: string; noteVisible: boolean; correctionVisible: boolean },
): Promise<void> {
  return journaliserLesRefus(acteur, "resultats.visibilite", async () => {
    const donnees = valider(schemaVisibilite, saisie, "Visibilité");
    const racine = await racineDeLActeur(db(), acteur, lireIdentifiant(donnees.sessionId, "Session"));
    await db().transaction(async (tx) => {
      await tx
        .update(sessionExamen)
        .set({ noteVisible: donnees.noteVisible, correctionVisible: donnees.correctionVisible })
        .where(or(eq(sessionExamen.id, racine.id), eq(sessionExamen.sessionOrigineId, racine.id)));
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "resultats.visibilite",
          cible: `session:${racine.id}`,
          details: { noteVisible: donnees.noteVisible, correctionVisible: donnees.correctionVisible },
        },
        tx,
      );
    });
  });
}
