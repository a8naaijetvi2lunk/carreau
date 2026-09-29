/**
 * Contrôles partagés du module sessions (plan du lot 4, décisions D1, D12 et D20) : propriété d'une
 * session, en-tête et résumé affichés aux étudiants, messages des états impossibles.
 */
import "server-only";
import { asc, eq } from "drizzle-orm";
import type { Executeur } from "@/db";
import { classe, qcm, question, sessionExamen, utilisateur } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { erreurs } from "@/lib/erreurs";
import { LIMITES_SESSION, type StatutSession } from "@/lib/regles-session";
import { resumerExamen, type ResumeExamen } from "@/lib/resume-examen";
import type { SessionAffichee } from "@/lib/vue-entree";

/** Corps JSON des routes de ce lot : 1 024 octets au plus (décision D16). */
export const TAILLE_MAX_CORPS_SESSIONS = 1024;

/** Messages des services (décisions D3 et D8 à D20). */
export const MESSAGES_SESSION = {
  // Enseignant.
  rgpd: "Les durées de conservation et le contact des données ne sont pas encore renseignés (Paramètres, super-admin) : aucune session ne peut être lancée.",
  qcmPasPret: "Ce QCM n'est pas prêt : marque-le comme prêt avant de créer une session.",
  qcmPlusPret: "Le QCM de cette session n'est plus prêt : repasse-le en « prêt » avant de démarrer.",
  classeArchivee: "Cette classe est archivée : restaure-la pour créer une session.",
  classeVide: "Cette classe n'a aucun étudiant.",
  limite: `Tu as déjà ${LIMITES_SESSION.ouvertesParCompte} sessions ouvertes : démarre ou annule les précédentes.`,
  creneauInvalide: "Indique une date et une heure valides (heure de Paris).",
  creneauPasse: "Ce créneau est déjà passé.",
  creneauLointain: "Choisis un créneau dans l'année qui vient.",
  dejaDemarree: "Cette session a déjà démarré.",
  terminee: "Cette session est terminée.",
  annulee: "Cette session a été annulée.",
  aucunParticipant: "Aucun étudiant n'a encore rejoint la salle d'attente.",
  annulationImpossible: "Seule une session en salle d'attente peut être annulée.",
  retraitImpossible: "La session a démarré : ce participant ne peut plus être retiré.",
  demandeTraitee: "Cette demande a déjà été traitée.",
  demandeExpiree: "Cette demande a expiré : l'étudiant doit la renouveler depuis son téléphone.",
  // Étudiant (vocabulaire non accusateur).
  codeFormat: "Le code comporte 6 lettres ou chiffres.",
  codeInvalide: "Code inconnu ou expiré : saisis le code affiché en ce moment au tableau.",
  ticketExpire: "Ton accès a expiré : scanne de nouveau le QR code affiché au tableau.",
  sessionDemarree: "La session a démarré. Préviens ton enseignant.",
  telephoneDejaAssocie:
    "Ce téléphone est déjà associé à un autre nom pour cet examen. Préviens ton enseignant.",
  demandeEnAttente: "Une demande est déjà en attente pour ce nom. Préviens ton enseignant.",
  sessionAnnuleeEtudiant: "Cette session a été annulée par ton enseignant.",
  rechercheCourte: "Tape au moins 3 lettres de ton nom ou de ton prénom.",
  rechercheLongue: "Ta saisie est trop longue.",
  informationIndisponible:
    "Les informations sur tes données ne sont pas encore disponibles : préviens ton enseignant.",
  participationIntrouvable: "Ton téléphone n'est associé à aucun nom pour cet examen : choisis ton nom.",
} as const;

export type SessionLue = {
  id: string;
  qcmId: string;
  classeId: string;
  statut: StatutSession;
  codeSecret: string;
  demarreLe: Date | null;
};

/**
 * Session de l'acteur. `verrouiller` la lit `FOR UPDATE` (démarrer, annuler, retirer : décision D14).
 * Session d'un autre compte : même réponse qu'une session inexistante, refus journalisé par
 * `journaliserLesRefus` (décision D1).
 */
export async function sessionDeLActeur(
  executeur: Executeur,
  acteur: ActeurUtilisateur,
  sessionId: string,
  verrouiller = false,
): Promise<SessionLue> {
  const requete = executeur
    .select({
      id: sessionExamen.id,
      enseignantId: sessionExamen.enseignantId,
      qcmId: sessionExamen.qcmId,
      classeId: sessionExamen.classeId,
      statut: sessionExamen.statut,
      codeSecret: sessionExamen.codeSecret,
      demarreLe: sessionExamen.demarreLe,
    })
    .from(sessionExamen)
    .where(eq(sessionExamen.id, sessionId));
  const [ligne] = verrouiller ? await requete.for("update") : await requete;
  if (!ligne) throw erreurs.introuvable("Session");
  if (ligne.enseignantId !== acteur.id) throw erreurs.ressourceAutrui("Session");
  return {
    id: ligne.id,
    qcmId: ligne.qcmId,
    classeId: ligne.classeId,
    statut: ligne.statut,
    codeSecret: ligne.codeSecret,
    demarreLe: ligne.demarreLe,
  };
}

/** Message d'une session qui n'est plus en salle d'attente (D20) ; chaîne vide en salle d'attente. */
export function messageStatut(statut: StatutSession): string {
  if (statut === "en_cours") return MESSAGES_SESSION.dejaDemarree;
  if (statut === "terminee") return MESSAGES_SESSION.terminee;
  if (statut === "annulee") return MESSAGES_SESSION.annulee;
  return "";
}

/** Titre du QCM, nom de la classe et de l'enseignant : en-tête des écrans étudiants (maquette « Rejoindre »). */
export async function sessionAffichee(executeur: Executeur, sessionId: string): Promise<SessionAffichee> {
  const [ligne] = await executeur
    .select({ titre: qcm.titre, classe: classe.nom, prenom: utilisateur.prenom, nom: utilisateur.nom })
    .from(sessionExamen)
    .innerJoin(qcm, eq(qcm.id, sessionExamen.qcmId))
    .innerJoin(classe, eq(classe.id, sessionExamen.classeId))
    .innerJoin(utilisateur, eq(utilisateur.id, sessionExamen.enseignantId))
    .where(eq(sessionExamen.id, sessionId));
  if (!ligne) throw erreurs.introuvable("Session");
  return { titre: ligne.titre, classe: ligne.classe, enseignant: `${ligne.prenom} ${ligne.nom}` };
}

/**
 * Résumé de l'examen d'un QCM (salle d'attente, pilotage), tiers-temps compris si demandé. Lu sur
 * le QCM au moment de l'appel : l'instantané de la session arrive au lot 5 (décision D12).
 */
export async function resumeDuQcm(
  executeur: Executeur,
  qcmId: string,
  tiersTemps: boolean,
): Promise<ResumeExamen> {
  const [lu] = await executeur
    .select({
      modeChrono: qcm.modeChrono,
      dureeGlobaleS: qcm.dureeGlobaleS,
      dureeQuestionS: qcm.dureeQuestionS,
    })
    .from(qcm)
    .where(eq(qcm.id, qcmId));
  if (!lu) throw erreurs.introuvable("QCM");
  const questions = await executeur
    .select({
      pointsBonne: question.pointsBonne,
      pointsMauvaise: question.pointsMauvaise,
      pointsVide: question.pointsVide,
      dureeS: question.dureeS,
    })
    .from(question)
    .where(eq(question.qcmId, qcmId))
    .orderBy(asc(question.position));
  return resumerExamen({ ...lu, questions }, tiersTemps);
}
