/**
 * Vues interrogées par l'enseignant (spec §7 ; décisions D10, D16 et amendement A1 du plan du lot 4) :
 * suivi de la page de pilotage (toutes les 3 s) et écran projeté (toutes les 2 s). Le code n'est
 * projeté qu'en salle d'attente.
 */
import "server-only";
import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Executeur } from "@/db";
import { demandeAppareil, etudiant, participation, sessionExamen } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { maintenant } from "@/lib/horloge";
import type { ModeChrono } from "@/lib/regles-qcm";
import { LIMITES_SESSION, nomComplet, nomCourt } from "@/lib/regles-session";
import { alerteFait, libelleFait, type Fait, type TypeFait } from "@/lib/regles-surveillance";
import { lireIdentifiant, valider } from "@/lib/validation";
import type { AlerteSuivi, StatutSuivi, VueProjection, VueSuivi } from "@/lib/vue-session";
import { rattraperSession, surveillanceDeLaSession } from "@/modules/examen";
import { journaliserLesRefus } from "@/modules/journal";
import { codeAffiche } from "./code";
import { sessionDeLActeur, type SessionLue } from "./commun";

const schemaSession = z.strictObject({ sessionId: z.string() });

/** Passe en « expiree » les demandes en attente depuis 10 minutes ou plus (décision D10). */
export async function expirerDemandes(executeur: Executeur, sessionId: string): Promise<void> {
  const limite = new Date(maintenant().getTime() - LIMITES_SESSION.dureeDemandeMs);
  await executeur
    .update(demandeAppareil)
    .set({ statut: "expiree" })
    .where(
      and(
        eq(demandeAppareil.statut, "en_attente"),
        lte(demandeAppareil.creeLe, limite),
        inArray(
          demandeAppareil.participationId,
          executeur
            .select({ id: participation.id })
            .from(participation)
            .where(eq(participation.sessionId, sessionId)),
        ),
      ),
    );
}

/** Nombre d'alertes en direct renvoyées (D10). */
const ALERTES_MAX = 10;
/** Ordre des faits de même heure dans les alertes : une sortie d'abord. */
const ORDRE_ALERTES: TypeFait[] = ["sortie", "ecran_partage", "presse_papiers", "coupure"];

function statutSuivi(statut: "attente" | "en_cours" | "terminee", deconnecte: boolean): StatutSuivi {
  if (statut === "en_cours" && deconnecte) return "deconnecte";
  return statut;
}

function dernierFait(faits: readonly Fait[]): string | null {
  const dernier = faits.at(-1);
  return dernier ? libelleFait(dernier) : null;
}

/** Participants, absents et demandes en attente d'une session, triés par nom, et son code s'il sert encore. */
export async function construireSuivi(executeur: Executeur, session: SessionLue): Promise<VueSuivi> {
  await expirerDemandes(executeur, session.id);
  const participants = await executeur
    .select({
      participationId: participation.id,
      nom: etudiant.nom,
      prenom: etudiant.prenom,
      tiersTemps: etudiant.tiersTemps,
      informationLueLe: participation.informationLueLe,
      statut: participation.statut,
      indexCourant: participation.indexCourant,
      echeanceGlobaleLe: participation.echeanceGlobaleLe,
      // Requête avec jointure : la colonne reste qualifiée (piège DevBrain).
      total: sql<number | null>`jsonb_array_length(${participation.ordre})`,
    })
    .from(participation)
    .innerJoin(etudiant, eq(etudiant.id, participation.etudiantId))
    .where(eq(participation.sessionId, session.id))
    .orderBy(asc(etudiant.nomNormalise), asc(etudiant.prenomNormalise));
  // LEFT JOIN et non NOT EXISTS : sans jointure, Drizzle déqualifierait les colonnes (piège DevBrain).
  const absents = await executeur
    .select({ etudiantId: etudiant.id, nom: etudiant.nom, prenom: etudiant.prenom })
    .from(etudiant)
    .leftJoin(
      participation,
      and(eq(participation.etudiantId, etudiant.id), eq(participation.sessionId, session.id)),
    )
    .where(and(eq(etudiant.classeId, session.classeId), isNull(participation.id)))
    .orderBy(asc(etudiant.nomNormalise), asc(etudiant.prenomNormalise));
  const demandes = await executeur
    .select({
      demandeId: demandeAppareil.id,
      nom: etudiant.nom,
      prenom: etudiant.prenom,
      motif: demandeAppareil.motif,
      creeLe: demandeAppareil.creeLe,
    })
    .from(demandeAppareil)
    .innerJoin(participation, eq(participation.id, demandeAppareil.participationId))
    .innerJoin(etudiant, eq(etudiant.id, participation.etudiantId))
    .where(and(eq(participation.sessionId, session.id), eq(demandeAppareil.statut, "en_attente")))
    .orderBy(asc(demandeAppareil.creeLe));
  const ouverte = session.statut === "attente" || session.statut === "en_cours";
  const instant = maintenant();
  const surveillance = await surveillanceDeLaSession(executeur, session.id, instant);
  const [chrono] = await executeur
    .select({ modeChrono: sql<ModeChrono | null>`${sessionExamen.contenu} ->> 'modeChrono'` })
    .from(sessionExamen)
    .where(eq(sessionExamen.id, session.id));
  const modeChrono = chrono?.modeChrono ?? null;
  const lignes = participants.map((p) => {
    const s = surveillance.get(p.participationId) ?? { indice: null, faits: [], deconnecte: false };
    return { ...p, surveillance: s, statutSuivi: statutSuivi(p.statut, s.deconnecte) };
  });
  const fins = lignes
    .filter((l) => l.statut === "en_cours" && l.echeanceGlobaleLe !== null)
    .map((l) => l.echeanceGlobaleLe?.getTime() ?? 0);
  const alertes: (AlerteSuivi & { type: TypeFait; nom: string; instant: number })[] = [];
  for (const l of lignes) {
    const nom = nomComplet(l.prenom, l.nom);
    // Le rang du fait dans la chronologie du participant distingue les faits d'un même lot (même
    // heure de réception, par exemple trois copier-coller d'un coup) : sans lui leurs clés seraient
    // identiques (clé de liste React du tableau de bord).
    for (const [index, fait] of l.surveillance.faits.entries()) {
      const alerte = alerteFait(fait, nom);
      if (!alerte) continue;
      alertes.push({
        ...alerte,
        cle: `${l.participationId}:${index}:${fait.type}:${fait.le.getTime()}`,
        le: fait.le.toISOString(),
        type: fait.type,
        nom,
        instant: fait.le.getTime(),
      });
    }
  }
  alertes.sort(
    (a, b) =>
      b.instant - a.instant ||
      ORDRE_ALERTES.indexOf(a.type) - ORDRE_ALERTES.indexOf(b.type) ||
      a.nom.localeCompare(b.nom, "fr"),
  );
  return {
    serveurMaintenant: instant.toISOString(),
    statut: session.statut,
    demarreLe: session.demarreLe?.toISOString() ?? null,
    effectif: participants.length + absents.length,
    participants: lignes.map((p) => ({
      participationId: p.participationId,
      nom: p.nom,
      prenom: p.prenom,
      tiersTemps: p.tiersTemps,
      informationLue: p.informationLueLe !== null,
      avancement:
        p.total === null
          ? null
          : { repondues: p.indexCourant, total: Number(p.total), terminee: p.statut === "terminee" },
      statut: p.statutSuivi,
      indice: p.surveillance.indice,
      dernierFait: dernierFait(p.surveillance.faits),
    })),
    absents,
    demandes: demandes.map((d) => ({
      demandeId: d.demandeId,
      nom: d.nom,
      prenom: d.prenom,
      motif: d.motif,
      creeLe: d.creeLe.toISOString(),
    })),
    code: ouverte ? await codeAffiche(session.codeSecret) : null,
    compteurs: {
      connectes: lignes.filter((l) => l.statutSuivi === "en_cours").length,
      termines: lignes.filter((l) => l.statutSuivi === "terminee").length,
      absents: absents.length,
      alertes: demandes.length,
    },
    finLe: modeChrono === "global" && fins.length > 0 ? new Date(Math.max(...fins)).toISOString() : null,
    modeChrono,
    alertes: alertes.slice(0, ALERTES_MAX).map(({ cle, le, titre, detail }) => ({ cle, le, titre, detail })),
  };
}

/**
 * Session de l'acteur, à jour : pendant l'examen, les passages échus sont rattrapés et la clôture est
 * tentée (spec §6.5, décision D6 du plan du lot 5), puis la session est relue.
 */
export async function sessionAJour(acteur: ActeurUtilisateur, sessionId: string): Promise<SessionLue> {
  const lue = await sessionDeLActeur(db(), acteur, sessionId);
  if (lue.statut !== "en_cours") return lue;
  await rattraperSession(lue.id);
  return sessionDeLActeur(db(), acteur, sessionId);
}

/** Suivi de la page de pilotage (spec §7 : toutes les 3 s). */
export async function suivreSession(
  acteur: ActeurUtilisateur,
  saisie: { sessionId: string },
): Promise<VueSuivi> {
  return journaliserLesRefus(acteur, "sessions.suivre", async () => {
    const sessionId = lireIdentifiant(valider(schemaSession, saisie, "Session").sessionId, "Session");
    return construireSuivi(db(), await sessionAJour(acteur, sessionId));
  });
}

/** Écran projeté (spec §7 : toutes les 2 s) : noms courts, code en salle d'attente seulement (A1). */
export async function projeterSession(
  acteur: ActeurUtilisateur,
  saisie: { sessionId: string },
): Promise<VueProjection> {
  return journaliserLesRefus(acteur, "sessions.projeter", async () => {
    const sessionId = lireIdentifiant(valider(schemaSession, saisie, "Session").sessionId, "Session");
    const vue = await construireSuivi(db(), await sessionAJour(acteur, sessionId));
    return {
      serveurMaintenant: vue.serveurMaintenant,
      statut: vue.statut,
      demarreLe: vue.demarreLe,
      effectif: vue.effectif,
      connectes: vue.participants.map((p) => nomCourt(p.prenom, p.nom)),
      absents: vue.absents.map((a) => nomCourt(a.prenom, a.nom)),
      code: vue.statut === "attente" ? vue.code : null,
    };
  });
}
