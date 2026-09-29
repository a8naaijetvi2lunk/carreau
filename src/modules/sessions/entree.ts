/**
 * Entrée des étudiants dans une session (spec §6.1 à §6.3 ; amendement A1, décisions D5 à D12, D15 et
 * D20 du plan du lot 4) : rejoindre par le code, rechercher son nom, le réclamer, lire l'information,
 * et l'état du téléphone, interrogé régulièrement. Aucun compte : le téléphone est identifié par son
 * ticket d'entrée et son jeton d'appareil, dont seule l'empreinte est stockée.
 */
import "server-only";
import { and, asc, count, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Transaction } from "@/db";
import { demandeAppareil, etudiant, evenement, participation, sessionExamen } from "@/db/schema";
import { erreurs } from "@/lib/erreurs";
import { maintenant } from "@/lib/horloge";
import { FORMAT_JETON, genererJeton, sha256Hex } from "@/lib/jetons";
import { normaliserNom } from "@/lib/noms";
import {
  LIMITES_SESSION,
  type MotifDemande,
  type StatutParticipation,
  type StatutSession,
} from "@/lib/regles-session";
import { lireIdentifiant, valider } from "@/lib/validation";
import type { EtatEntree, InformationDonnees, ResultatRecherche } from "@/lib/vue-entree";
import { enregistrerBrouillon, validerQuestion, vuePassage, type SaisieReponse } from "@/modules/examen";
import { journaliser } from "@/modules/journal";
import { reserverJournalise } from "@/modules/limiteur";
import { lireInformationDonnees } from "@/modules/parametres";
import { normaliserCode } from "@/moteur/code-session";
import {
  cleEtatAppareil,
  cleEtatTicket,
  cleInformation,
  cleRecherche,
  cleReclamer,
  cleReponse,
  cleRejoindreIp,
  cleSelection,
  REGLE_ETAT,
  REGLE_INFORMATION,
  REGLE_RECHERCHE,
  REGLE_RECLAMER,
  REGLE_REJOINDRE_IP,
  REGLE_REPONSE,
  REGLE_SELECTION,
} from "./cles";
import { sessionParCode } from "./code";
import { MESSAGES_SESSION, resumeDuQcm, sessionAffichee } from "./commun";
import { emettreTicket, lireTicket, type Ticket } from "./ticket";

/** Cookies reçus du téléphone (`lireCookiesEntree`). */
export type Telephone = { ticket: string | null; jetonAppareil: string | null };

/** État à afficher, et cookies à poser : ticket émis, nouveau jeton d'appareil. */
export type ResultatEntree = { etat: EtatEntree; ticket?: string; jetonAppareil?: string };

const schemaRejoindre = z.strictObject({
  code: z.string({ error: MESSAGES_SESSION.codeFormat }).max(20, { error: MESSAGES_SESSION.codeFormat }),
});
const schemaRecherche = z.strictObject({
  debut: z
    .string({ error: MESSAGES_SESSION.rechercheCourte })
    .max(LIMITES_SESSION.rechercheMax, { error: MESSAGES_SESSION.rechercheLongue }),
});
const schemaReclamation = z.strictObject({ etudiantId: z.string() });

function horodatage(): { serveurMaintenant: string } {
  return { serveurMaintenant: maintenant().toISOString() };
}

/** Empreinte du jeton d'appareil, ou null s'il est absent ou mal formé (décision D7). */
function empreinteAppareil(jeton: string | null): string | null {
  return jeton !== null && FORMAT_JETON.test(jeton) ? sha256Hex(jeton) : null;
}

function exigerTicket(valeur: string | null): Ticket {
  const ticket = lireTicket(valeur);
  if (!ticket) throw erreurs.etat(MESSAGES_SESSION.ticketExpire, { raison: "ticket" });
  return ticket;
}

/** Une session annulée ou terminée n'accepte plus aucune entrée (décision D20). */
function exigerOuverte(statut: StatutSession): void {
  if (statut === "annulee") throw erreurs.etat(MESSAGES_SESSION.sessionAnnuleeEtudiant);
  if (statut === "terminee") throw erreurs.etat(MESSAGES_SESSION.terminee);
}

async function informationOuErreur(): Promise<InformationDonnees> {
  const information = await lireInformationDonnees();
  if (!information) throw erreurs.etat(MESSAGES_SESSION.informationIndisponible);
  return information;
}

type ParticipationLue = {
  id: string;
  sessionId: string;
  informationLueLe: Date | null;
  statutSession: StatutSession;
  statutParticipation: StatutParticipation;
  demarreLe: Date | null;
  qcmId: string;
  prenom: string;
  tiersTemps: boolean;
};

/**
 * État d'une participation (décision D11 du plan du lot 5) ; l'appel note le dernier contact du
 * téléphone (spec §7 : battement). Pendant l'examen, la vue vient du module examen, après rattrapage.
 */
async function etatDeLaParticipation(p: ParticipationLue): Promise<EtatEntree> {
  const instant = maintenant();
  await db().update(participation).set({ dernierContactLe: instant }).where(eq(participation.id, p.id));
  const base = {
    serveurMaintenant: instant.toISOString(),
    session: await sessionAffichee(db(), p.sessionId),
  };
  if (p.statutSession === "annulee") return { ...base, etape: "fermee", raison: "annulee" };
  if (p.statutParticipation === "terminee") {
    const vue = await vuePassage(p.id);
    if (vue?.etape === "fin") return { ...base, ...vue, prenom: p.prenom };
  }
  if (p.statutSession === "terminee") return { ...base, etape: "fermee", raison: "terminee" };
  if (p.informationLueLe === null) {
    return { ...base, etape: "information", prenom: p.prenom, information: await informationOuErreur() };
  }
  if (p.statutSession === "en_cours" && p.demarreLe) {
    const demarrage = {
      ...base,
      etape: "demarrage" as const,
      prenom: p.prenom,
      demarreLe: p.demarreLe.toISOString(),
    };
    if (instant.getTime() < p.demarreLe.getTime()) return demarrage;
    const vue = await vuePassage(p.id);
    if (vue?.etape === "question") return { ...base, ...vue };
    if (vue?.etape === "fin") return { ...base, ...vue, prenom: p.prenom };
    return demarrage;
  }
  const [inscrits] = await db()
    .select({ total: count() })
    .from(participation)
    .where(eq(participation.sessionId, p.sessionId));
  return {
    ...base,
    etape: "attente",
    prenom: p.prenom,
    connectes: inscrits?.total ?? 0,
    examen: await resumeDuQcm(db(), p.qcmId, p.tiersTemps),
  };
}

/**
 * État d'un téléphone d'après son jeton : sa participation, sa demande d'appareil, ou l'ancien
 * appareil qu'une demande autorisée a remplacé (D10). Null si rien ne correspond, ou si le ticket
 * désigne une autre session : le téléphone rejoint alors un nouvel examen.
 */
async function etatDeLAppareil(
  empreinte: string,
  sessionDuTicket: string | null,
): Promise<EtatEntree | null> {
  const convient = (sessionId: string) => sessionDuTicket === null || sessionDuTicket === sessionId;

  const [p] = await db()
    .select({
      id: participation.id,
      sessionId: participation.sessionId,
      informationLueLe: participation.informationLueLe,
      statutSession: sessionExamen.statut,
      statutParticipation: participation.statut,
      demarreLe: sessionExamen.demarreLe,
      qcmId: sessionExamen.qcmId,
      prenom: etudiant.prenom,
      tiersTemps: etudiant.tiersTemps,
    })
    .from(participation)
    .innerJoin(sessionExamen, eq(sessionExamen.id, participation.sessionId))
    .innerJoin(etudiant, eq(etudiant.id, participation.etudiantId))
    .where(eq(participation.appareilJetonHash, empreinte));
  if (p && convient(p.sessionId)) return etatDeLaParticipation(p);

  const [d] = await db()
    .select({
      sessionId: participation.sessionId,
      etudiantId: participation.etudiantId,
      statut: demandeAppareil.statut,
      motif: demandeAppareil.motif,
      creeLe: demandeAppareil.creeLe,
    })
    .from(demandeAppareil)
    .innerJoin(participation, eq(participation.id, demandeAppareil.participationId))
    .where(eq(demandeAppareil.jetonHash, empreinte));
  if (d && d.statut !== "autorisee" && convient(d.sessionId)) {
    const expiree =
      d.statut === "expiree" ||
      (d.statut === "en_attente" &&
        maintenant().getTime() - d.creeLe.getTime() >= LIMITES_SESSION.dureeDemandeMs);
    return {
      ...horodatage(),
      etape: "demande",
      session: await sessionAffichee(db(), d.sessionId),
      etudiantId: d.etudiantId,
      statut: expiree ? "expiree" : d.statut === "refusee" ? "refusee" : "en_attente",
      motif: d.motif,
    };
  }

  const [remplace] = await db()
    .select({ sessionId: participation.sessionId })
    .from(demandeAppareil)
    .innerJoin(participation, eq(participation.id, demandeAppareil.participationId))
    .where(and(eq(demandeAppareil.ancienJetonHash, empreinte), eq(demandeAppareil.statut, "autorisee")))
    .orderBy(desc(demandeAppareil.traiteeLe))
    .limit(1);
  if (remplace && convient(remplace.sessionId)) {
    return { ...horodatage(), etape: "remplace", session: await sessionAffichee(db(), remplace.sessionId) };
  }
  return null;
}

/** État du téléphone : son appareil d'abord, puis son ticket, sinon la saisie du code (décision D19). */
async function etatDuTelephone(telephone: Telephone): Promise<EtatEntree> {
  const ticket = lireTicket(telephone.ticket);
  const empreinte = empreinteAppareil(telephone.jetonAppareil);
  if (empreinte !== null) {
    const etat = await etatDeLAppareil(empreinte, ticket?.sessionId ?? null);
    if (etat) return etat;
  }
  if (ticket) {
    const [session] = await db()
      .select({ statut: sessionExamen.statut })
      .from(sessionExamen)
      .where(eq(sessionExamen.id, ticket.sessionId));
    if (session) {
      const affichee = await sessionAffichee(db(), ticket.sessionId);
      if (session.statut === "annulee" || session.statut === "terminee") {
        return { ...horodatage(), etape: "fermee", session: affichee, raison: session.statut };
      }
      return { ...horodatage(), etape: "nom", session: affichee, demarree: session.statut === "en_cours" };
    }
  }
  return { ...horodatage(), etape: "code" };
}

/** Étape 1 (spec §6.2) : un code valable donne un ticket d'entrée lié à sa session (D5, D6). */
export async function rejoindreSession(
  telephone: Telephone,
  saisie: { code: string; ip: string },
): Promise<ResultatEntree> {
  await reserverJournalise(cleRejoindreIp(saisie.ip), REGLE_REJOINDRE_IP, {
    action: "sessions.limite_rejoindre",
  });
  const { code } = valider(schemaRejoindre, { code: saisie.code }, "Code");
  if (normaliserCode(code) === null) throw erreurs.validation(MESSAGES_SESSION.codeFormat);
  const session = await sessionParCode(code);
  if (!session) throw erreurs.validation(MESSAGES_SESSION.codeInvalide);
  const ticket = emettreTicket(session.id);
  return { etat: await etatDuTelephone({ ticket, jetonAppareil: telephone.jetonAppareil }), ticket };
}

/**
 * Étape 2 : 8 étudiants au plus de la classe de la session, dont le nom, le prénom, « prénom nom » ou
 * « nom prénom » normalisés commencent par la saisie (spec §6.2, décision D8).
 */
export async function rechercherEtudiants(
  telephone: Telephone,
  saisie: { debut: string },
): Promise<ResultatRecherche> {
  const ticket = exigerTicket(telephone.ticket);
  await reserverJournalise(cleRecherche(ticket.nonce), REGLE_RECHERCHE, {
    action: "sessions.limite_recherche",
    cible: `session:${ticket.sessionId}`,
  });
  const debut = normaliserNom(valider(schemaRecherche, saisie, "Recherche").debut);
  if (debut.length < LIMITES_SESSION.rechercheMin) throw erreurs.validation(MESSAGES_SESSION.rechercheCourte);
  const [session] = await db()
    .select({ classeId: sessionExamen.classeId, statut: sessionExamen.statut })
    .from(sessionExamen)
    .where(eq(sessionExamen.id, ticket.sessionId));
  if (!session) throw erreurs.etat(MESSAGES_SESSION.ticketExpire, { raison: "ticket" });
  exigerOuverte(session.statut);
  const e = etudiant;
  // Une seule table : les colonnes non qualifiées de `starts_with` sont voulues (piège DevBrain).
  const lignes = await db()
    .select({ id: e.id, nom: e.nom, prenom: e.prenom })
    .from(e)
    .where(
      and(
        eq(e.classeId, session.classeId),
        or(
          sql`starts_with(${e.nomNormalise}, ${debut})`,
          sql`starts_with(${e.prenomNormalise}, ${debut})`,
          sql`starts_with(${e.prenomNormalise} || ' ' || ${e.nomNormalise}, ${debut})`,
          sql`starts_with(${e.nomNormalise} || ' ' || ${e.prenomNormalise}, ${debut})`,
        ),
      ),
    )
    .orderBy(asc(e.nomNormalise), asc(e.prenomNormalise))
    .limit(LIMITES_SESSION.resultatsMax + 1);
  return {
    etudiants: lignes.slice(0, LIMITES_SESSION.resultatsMax),
    autres: lignes.length > LIMITES_SESSION.resultatsMax,
  };
}

type IssueReclamation = { jetonAppareil?: string };

async function participationVerrouillee(tx: Transaction, sessionId: string, etudiantId: string) {
  const [ligne] = await tx
    .select({ id: participation.id, appareilJetonHash: participation.appareilJetonHash })
    .from(participation)
    .where(and(eq(participation.sessionId, sessionId), eq(participation.etudiantId, etudiantId)))
    .for("update");
  return ligne;
}

/**
 * Demande d'appareil sur une participation d'un autre téléphone (décision D10) : une seule en attente,
 * nouveau jeton pour ce téléphone, événement « second_appareil » et journal anonyme.
 */
async function demanderAppareil(
  tx: Transaction,
  participationId: string,
  motif: MotifDemande,
  empreinte: string | null,
): Promise<IssueReclamation> {
  const instant = maintenant();
  const [enAttente] = await tx
    .select({ id: demandeAppareil.id, jetonHash: demandeAppareil.jetonHash, creeLe: demandeAppareil.creeLe })
    .from(demandeAppareil)
    .where(
      and(eq(demandeAppareil.participationId, participationId), eq(demandeAppareil.statut, "en_attente")),
    )
    .for("update");
  if (enAttente) {
    if (instant.getTime() - enAttente.creeLe.getTime() < LIMITES_SESSION.dureeDemandeMs) {
      if (empreinte !== null && enAttente.jetonHash === empreinte) return {};
      throw erreurs.etat(MESSAGES_SESSION.demandeEnAttente);
    }
    await tx.update(demandeAppareil).set({ statut: "expiree" }).where(eq(demandeAppareil.id, enAttente.id));
  }
  const jeton = genererJeton();
  await tx
    .insert(demandeAppareil)
    .values({ participationId, motif, jetonHash: sha256Hex(jeton), creeLe: instant });
  // Signal « second appareil » sur la participation d'origine (spec §6.2 et §8.2).
  await tx
    .insert(evenement)
    .values({ participationId, type: "second_appareil", recuLe: instant, details: { motif } });
  await journaliser(
    {
      acteur: { type: "anonyme" },
      action: "sessions.demander_appareil",
      cible: `participation:${participationId}`,
      details: { motif },
    },
    tx,
  );
  return { jetonAppareil: jeton };
}

/** Le jeton de ce téléphone désigne-t-il déjà une participation de la session (décision D9) ? */
async function exigerTelephoneLibre(
  tx: Transaction,
  sessionId: string,
  empreinte: string | null,
): Promise<void> {
  if (empreinte === null) return;
  const [dejaAssocie] = await tx
    .select({ id: participation.id })
    .from(participation)
    .where(and(eq(participation.sessionId, sessionId), eq(participation.appareilJetonHash, empreinte)));
  if (dejaAssocie) throw erreurs.etat(MESSAGES_SESSION.telephoneDejaAssocie);
}

/** Réclamation dans une transaction, verrous dans l'ordre session, étudiant, participation (D9, D14). */
async function reclamerDansTransaction(
  tx: Transaction,
  sessionId: string,
  etudiantId: string,
  empreinte: string | null,
): Promise<IssueReclamation> {
  // FOR SHARE : les réclamations passent en parallèle, « Démarrer » (FOR UPDATE) attend qu'elles aboutissent.
  const [session] = await tx
    .select({ classeId: sessionExamen.classeId, statut: sessionExamen.statut })
    .from(sessionExamen)
    .where(eq(sessionExamen.id, sessionId))
    .for("share");
  if (!session) throw erreurs.etat(MESSAGES_SESSION.ticketExpire, { raison: "ticket" });
  exigerOuverte(session.statut);
  // FOR KEY SHARE : un retrait concurrent de l'étudiant de sa classe attend la fin de la réclamation.
  const [eleve] = await tx
    .select({ id: etudiant.id })
    .from(etudiant)
    .where(and(eq(etudiant.id, etudiantId), eq(etudiant.classeId, session.classeId)))
    .for("key share");
  if (!eleve) throw erreurs.introuvable("Étudiant");
  let existante = await participationVerrouillee(tx, sessionId, etudiantId);
  if (!existante) {
    if (session.statut === "en_cours") throw erreurs.etat(MESSAGES_SESSION.sessionDemarree);
    await exigerTelephoneLibre(tx, sessionId, empreinte);
    const jeton = genererJeton();
    const instant = maintenant();
    const [creee] = await tx
      .insert(participation)
      .values({
        sessionId,
        etudiantId,
        appareilJetonHash: sha256Hex(jeton),
        rejointeLe: instant,
        dernierContactLe: instant,
      })
      .onConflictDoNothing({ target: [participation.sessionId, participation.etudiantId] })
      .returning({ id: participation.id });
    if (creee) return { jetonAppareil: jeton };
    // Course perdue : un autre téléphone vient de réclamer ce nom ; celui-ci passe par une demande.
    existante = await participationVerrouillee(tx, sessionId, etudiantId);
    if (!existante) throw new Error("Participation introuvable après un conflit d'insertion.");
  }
  if (empreinte !== null && existante.appareilJetonHash === empreinte) return {};
  // La participation réclamée n'a pas le jeton de ce téléphone : une ligne trouvée ici est forcément une autre participation.
  await exigerTelephoneLibre(tx, sessionId, empreinte);
  return demanderAppareil(
    tx,
    existante.id,
    session.statut === "en_cours" ? "reprise" : "second_appareil",
    empreinte,
  );
}

/**
 * Étape 3 (spec §6.2, décision D9) : participation créée, reprise directe par le même téléphone, ou
 * demande d'appareil à l'enseignant.
 */
export async function reclamerNom(
  telephone: Telephone,
  saisie: { etudiantId: string },
): Promise<ResultatEntree> {
  const ticket = exigerTicket(telephone.ticket);
  await reserverJournalise(cleReclamer(ticket.nonce), REGLE_RECLAMER, {
    action: "sessions.limite_reclamer",
    cible: `session:${ticket.sessionId}`,
  });
  const etudiantId = lireIdentifiant(
    valider(schemaReclamation, saisie, "Réclamation").etudiantId,
    "Étudiant",
  );
  const empreinte = empreinteAppareil(telephone.jetonAppareil);
  const issue = await db().transaction((tx) =>
    reclamerDansTransaction(tx, ticket.sessionId, etudiantId, empreinte),
  );
  const etat = await etatDuTelephone({
    ticket: telephone.ticket,
    jetonAppareil: issue.jetonAppareil ?? telephone.jetonAppareil,
  });
  return issue.jetonAppareil ? { etat, jetonAppareil: issue.jetonAppareil } : { etat };
}

/** Étape 4 (spec §6.2, amendement A2) : la lecture de l'information est enregistrée une seule fois (D11). */
export async function confirmerInformation(telephone: Telephone): Promise<ResultatEntree> {
  const empreinte = empreinteAppareil(telephone.jetonAppareil);
  if (empreinte === null || telephone.jetonAppareil === null) {
    throw erreurs.etat(MESSAGES_SESSION.participationIntrouvable, { raison: "participation" });
  }
  await reserverJournalise(cleInformation(telephone.jetonAppareil), REGLE_INFORMATION, {
    action: "sessions.limite_information",
  });
  const [lue] = await db()
    .select({ id: participation.id })
    .from(participation)
    .where(eq(participation.appareilJetonHash, empreinte));
  if (!lue) throw erreurs.etat(MESSAGES_SESSION.participationIntrouvable, { raison: "participation" });
  await informationOuErreur();
  // Idempotent : la première lecture fait foi.
  await db()
    .update(participation)
    .set({ informationLueLe: maintenant() })
    .where(and(eq(participation.id, lue.id), isNull(participation.informationLueLe)));
  return { etat: await etatDuTelephone(telephone) };
}

/**
 * État du téléphone (spec §7), interrogé régulièrement. Limité par appareil, à défaut par ticket ;
 * un téléphone sans cookie reçoit l'étape du code sans lecture de la base (D15).
 */
export async function lireEtatEntree(telephone: Telephone): Promise<ResultatEntree> {
  if (telephone.jetonAppareil !== null && empreinteAppareil(telephone.jetonAppareil) !== null) {
    await reserverJournalise(cleEtatAppareil(telephone.jetonAppareil), REGLE_ETAT, {
      action: "sessions.limite_etat",
    });
  } else {
    const ticket = lireTicket(telephone.ticket);
    if (ticket)
      await reserverJournalise(cleEtatTicket(ticket.nonce), REGLE_ETAT, { action: "sessions.limite_etat" });
  }
  return { etat: await etatDuTelephone(telephone) };
}

/** Participation du téléphone (jeton bien formé et connu), ou null. */
async function participationDe(telephone: Telephone): Promise<string | null> {
  const empreinte = empreinteAppareil(telephone.jetonAppareil);
  if (empreinte === null) return null;
  const [lue] = await db()
    .select({ id: participation.id })
    .from(participation)
    .where(eq(participation.appareilJetonHash, empreinte));
  return lue?.id ?? null;
}

/** Participation du téléphone, ou ETAT « aucun nom » : aucune clé du limiteur n'est posée avant (D13). */
async function participationDuTelephone(telephone: Telephone): Promise<string> {
  const participationId = await participationDe(telephone);
  if (participationId === null) {
    throw erreurs.etat(MESSAGES_SESSION.participationIntrouvable, { raison: "participation" });
  }
  return participationId;
}

/** Brouillon de la question courante, à chaque touche (spec §6.4, décisions D7 et D13 du plan du lot 5). */
export async function selectionnerReponses(
  telephone: Telephone,
  saisie: SaisieReponse,
): Promise<{ enregistree: true }> {
  const participationId = await participationDuTelephone(telephone);
  await reserverJournalise(cleSelection(participationId), REGLE_SELECTION, {
    action: "sessions.limite_selection",
    cible: `participation:${participationId}`,
  });
  await enregistrerBrouillon(participationId, saisie);
  return { enregistree: true };
}

/** Validation de la question courante (D8, D13) ; renvoie le nouvel état du téléphone. */
export async function validerReponse(telephone: Telephone, saisie: SaisieReponse): Promise<ResultatEntree> {
  const participationId = await participationDuTelephone(telephone);
  await reserverJournalise(cleReponse(participationId), REGLE_REPONSE, {
    action: "sessions.limite_reponse",
    cible: `participation:${participationId}`,
  });
  await validerQuestion(participationId, saisie);
  return { etat: await etatDuTelephone(telephone) };
}
