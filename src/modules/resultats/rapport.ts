/**
 * Rapport par étudiant (spec §8.4 ; décisions D7, D9 et D10 du plan du lot 7) : note, bonnes
 * réponses, détail de l'indice stocké à la fin du passage, chronologie recalculée à partir des
 * événements bruts, évolution sur les examens de la même fiche chez le même enseignant.
 */
import "server-only";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { classe, etudiant, participation, qcm, reponse, sessionExamen } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { erreurs } from "@/lib/erreurs";
import type { OrdrePassage } from "@/lib/instantane";
import { LIBELLES_SIGNAL, PONDERATION_V1, type LigneIndice, type Signal } from "@/lib/regles-surveillance";
import { formaterDuree } from "@/lib/textes";
import { lireIdentifiant, valider } from "@/lib/validation";
import type { LigneDetailIndice, PointEvolution, RapportEtudiant } from "@/lib/vue-resultats";
import { evenementsBruts, rattraperSession } from "@/modules/examen";
import { journaliserLesRefus } from "@/modules/journal";
import { chronologie, type ReponseDatee } from "@/moteur/chronologie";
import { consolider, type Consolidation, type Intervalle } from "@/moteur/indice";
import { bonnesReponses } from "./commun";

const schemaRapport = z.strictObject({ participationId: z.string() });
/** Examens montrés dans l'évolution : les 12 derniers. */
const EVOLUTION_MAX = 12;

function secondes(ms: number): number {
  return Math.round(ms / 1000);
}

/** Durée totale recalculée des signaux à durée (D9), avec leur nombre pour la comparer aux lignes stockées. */
function durees(c: Consolidation): Partial<Record<Signal, { nombre: number; dureeMs: number }>> {
  const somme = (liste: readonly Intervalle[]) => ({
    nombre: liste.length,
    dureeMs: liste.reduce((total, x) => total + x.dureeMs, 0),
  });
  return {
    sortie: somme(c.sorties),
    focus: somme(c.focus.filter((f) => f.dureeMs >= PONDERATION_V1.focusMinMs)),
    coupure: somme(c.coupures),
    appareil_autorise: { nombre: c.reprisesAutorisees.length, dureeMs: somme(c.changementsAppareil).dureeMs },
  };
}

function lignesDetail(
  stockees: readonly LigneIndice[],
  version: number,
  c: Consolidation,
): LigneDetailIndice[] {
  const recalculees = version === PONDERATION_V1.version ? durees(c) : {};
  return stockees.map((l) => {
    const r = recalculees[l.signal];
    return {
      signal: l.signal,
      libelle: LIBELLES_SIGNAL[l.signal],
      nombre: l.nombre,
      points: l.points,
      precision: r && r.nombre === l.nombre ? `${formaterDuree(secondes(r.dureeMs))} au total` : null,
    };
  });
}

/** Numéro d'une question dans l'ordre du QCM (D7) depuis le rang de l'étudiant. */
function numero(ordre: OrdrePassage, index: number | null): number | null {
  if (index === null) return null;
  const entree = ordre[index];
  return entree ? entree.q + 1 : null;
}

export async function lireRapport(
  acteur: ActeurUtilisateur,
  saisie: { participationId: string },
): Promise<RapportEtudiant> {
  return journaliserLesRefus(acteur, "resultats.rapport", async () => {
    const participationId = lireIdentifiant(
      valider(schemaRapport, saisie, "Rapport").participationId,
      "Rapport",
    );
    const [proprietaire] = await db()
      .select({
        sessionId: participation.sessionId,
        enseignantId: sessionExamen.enseignantId,
        statut: sessionExamen.statut,
      })
      .from(participation)
      .innerJoin(sessionExamen, eq(sessionExamen.id, participation.sessionId))
      .where(eq(participation.id, participationId));
    if (!proprietaire) throw erreurs.introuvable("Rapport");
    if (proprietaire.enseignantId !== acteur.id) throw erreurs.ressourceAutrui("Rapport");
    // Rattrapage en cours : le passage échu est clos avant la lecture (spec §6.5).
    if (proprietaire.statut === "en_cours") await rattraperSession(proprietaire.sessionId);
    const [lu] = await db()
      .select({
        sessionId: participation.sessionId,
        sessionOrigineId: sessionExamen.sessionOrigineId,
        type: sessionExamen.type,
        demarreLe: sessionExamen.demarreLe,
        contenu: sessionExamen.contenu,
        titreQcm: qcm.titre,
        classe: classe.nom,
        etudiantId: participation.etudiantId,
        nom: etudiant.nom,
        prenom: etudiant.prenom,
        statut: participation.statut,
        tiersTemps: participation.tiersTemps,
        ordre: participation.ordre,
        termineeLe: participation.termineeLe,
        noteSur20: participation.noteSur20,
        points: participation.points,
        indice: participation.indice,
        indiceVersion: participation.indiceVersion,
        indiceDetail: participation.indiceDetail,
      })
      .from(participation)
      .innerJoin(sessionExamen, eq(sessionExamen.id, participation.sessionId))
      .innerJoin(qcm, eq(qcm.id, sessionExamen.qcmId))
      .innerJoin(etudiant, eq(etudiant.id, participation.etudiantId))
      .innerJoin(classe, eq(classe.id, etudiant.classeId))
      .where(eq(participation.id, participationId));
    if (!lu) throw erreurs.introuvable("Rapport");
    const racineId = lu.sessionOrigineId ?? lu.sessionId;
    const { contenu, ordre, demarreLe, termineeLe } = lu;
    if (lu.statut !== "terminee" || !contenu || !ordre || !demarreLe || !termineeLe) {
      return { disponible: false, sessionId: racineId, nom: lu.nom, prenom: lu.prenom };
    }
    const bruts = (await evenementsBruts(db(), [participationId])).get(participationId) ?? [];
    const consolidation = consolider(bruts, termineeLe);
    const rangDe = new Map(ordre.map((e, index) => [contenu.questions[e.q]?.cle, index]));
    const closes = await db()
      .select({
        cle: reponse.questionCle,
        le: reponse.valideeLe,
        origine: reponse.origine,
        selection: reponse.selection,
      })
      .from(reponse)
      .where(and(eq(reponse.participationId, participationId), isNotNull(reponse.valideeLe)));
    const reponses: ReponseDatee[] = closes.flatMap((r) => {
      const index = rangDe.get(r.cle);
      return index === undefined || r.le === null || r.origine === null
        ? []
        : [{ index, le: r.le, origine: r.origine }];
    });
    const entrees = chronologie({
      demarreLe,
      termineeLe,
      consolidation,
      reponses,
      repondues: closes.filter((r) => (r.selection?.length ?? 0) > 0).length,
      total: ordre.length,
    });
    // Requête avec jointures : les colonnes du coalesce restent qualifiées (piège DevBrain).
    const historique = await db()
      .select({
        participationId: participation.id,
        titre: sql<string>`coalesce(${sessionExamen.contenu} ->> 'titre', ${qcm.titre})`,
        le: sessionExamen.demarreLe,
        note: participation.noteSur20,
        indice: participation.indice,
      })
      .from(participation)
      .innerJoin(sessionExamen, eq(sessionExamen.id, participation.sessionId))
      .innerJoin(qcm, eq(qcm.id, sessionExamen.qcmId))
      .where(
        and(
          eq(participation.etudiantId, lu.etudiantId),
          eq(sessionExamen.enseignantId, acteur.id),
          eq(participation.statut, "terminee"),
        ),
      )
      .orderBy(asc(sessionExamen.demarreLe));
    const evolution = historique.flatMap((h): PointEvolution[] =>
      h.le === null
        ? []
        : [
            {
              participationId: h.participationId,
              titre: h.titre,
              le: h.le.toISOString(),
              note: h.note ?? 0,
              indice: h.indice,
              courante: h.participationId === participationId,
            },
          ],
    );
    const detail = lu.indiceDetail ?? [];
    const total = detail.reduce((somme, l) => somme + l.points, 0);
    return {
      disponible: true,
      vue: {
        sessionId: racineId,
        participationId,
        nom: lu.nom,
        prenom: lu.prenom,
        classe: lu.classe,
        titre: contenu.titre,
        le: demarreLe.toISOString(),
        rattrapage: lu.type === "rattrapage",
        tiersTemps: lu.tiersTemps,
        note: lu.noteSur20 ?? 0,
        points: lu.points ?? 0,
        bonnes: (await bonnesReponses(db(), [participationId], contenu)).get(participationId) ?? 0,
        questions: ordre.length,
        dureeS: Math.max(0, secondes(termineeLe.getTime() - demarreLe.getTime())),
        indice:
          lu.indice === null || lu.indiceVersion === null
            ? null
            : {
                valeur: lu.indice,
                version: lu.indiceVersion,
                lignes: lignesDetail(detail, lu.indiceVersion, consolidation),
                plafonne: total > lu.indice,
              },
        chronologie: entrees.map((e) => ({
          le: e.le.toISOString(),
          question: numero(ordre, e.index),
          texte: e.texte,
          dureeS: e.dureeMs === null ? null : secondes(e.dureeMs),
          sorte: e.sorte,
        })),
        evolution: evolution.slice(-EVOLUTION_MAX),
      },
    };
  });
}
