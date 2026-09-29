/**
 * Vues interrogées par l'enseignant (spec §7 ; décisions D10, D16 et amendement A1 du plan du lot 4) :
 * suivi de la page de pilotage (toutes les 3 s) et écran projeté (toutes les 2 s). Le code n'est
 * projeté qu'en salle d'attente.
 */
import "server-only";
import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Executeur } from "@/db";
import { demandeAppareil, etudiant, participation } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { maintenant } from "@/lib/horloge";
import { LIMITES_SESSION, nomCourt } from "@/lib/regles-session";
import { lireIdentifiant, valider } from "@/lib/validation";
import type { VueProjection, VueSuivi } from "@/lib/vue-session";
import { rattraperSession } from "@/modules/examen";
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
  return {
    serveurMaintenant: maintenant().toISOString(),
    statut: session.statut,
    demarreLe: session.demarreLe?.toISOString() ?? null,
    effectif: participants.length + absents.length,
    participants: participants.map((p) => ({
      participationId: p.participationId,
      nom: p.nom,
      prenom: p.prenom,
      tiersTemps: p.tiersTemps,
      informationLue: p.informationLueLe !== null,
      avancement:
        p.total === null
          ? null
          : { repondues: p.indexCourant, total: Number(p.total), terminee: p.statut === "terminee" },
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
