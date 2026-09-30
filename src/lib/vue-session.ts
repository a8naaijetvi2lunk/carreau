/**
 * Vues interrogées par l'enseignant (spec §7, plan du lot 4) : page de pilotage (suivi) et écran
 * projeté. Types seuls, partagés par le module sessions et les pages.
 */
import type { MotifDemande, StatutSession } from "./regles-session";
import type { ModeChrono } from "./regles-qcm";

/** Code affiché (« K7M 4QP »), lien du QR code, adresse de saisie et QR code en URI `data:`. */
export type CodeAffiche = {
  code: string;
  secondesRestantes: number;
  lien: string;
  adresse: string;
  qrCode: string;
};

/** Statut d'un participant au tableau de bord (D10 du plan du lot 6) : « deconnecte », en cours et muet depuis plus de 15 s. */
export type StatutSuivi = "attente" | "en_cours" | "deconnecte" | "terminee";

export type ParticipantSuivi = {
  participationId: string;
  nom: string;
  prenom: string;
  tiersTemps: boolean;
  informationLue: boolean;
  /** Pendant et après l'examen : questions passées, total, passage terminé (lot 5) ; null avant le départ. */
  avancement: { repondues: number; total: number; terminee: boolean } | null;
  statut: StatutSuivi;
  /** Indice de suspicion, calculé à chaque interrogation (D9) ; null avant le départ. */
  indice: number | null;
  /** Dernier fait notable (« Sortie 38 s · Q7 · 10:42:13 ») ; null s'il n'y en a aucun. */
  dernierFait: string | null;
};

export type AbsentSuivi = { etudiantId: string; nom: string; prenom: string };

export type DemandeSuivi = {
  demandeId: string;
  nom: string;
  prenom: string;
  motif: MotifDemande;
  creeLe: string;
};

/** Alerte en direct (D10, D11) : fait notable récent d'un étudiant. `le` : heure du fait (ISO). */
export type AlerteSuivi = { cle: string; le: string; titre: string; detail: string };

/** Compteurs du tableau de bord ; `alertes` : demandes d'appareil en attente, à traiter. */
export type CompteursSuivi = { connectes: number; termines: number; absents: number; alertes: number };

export type VueSuivi = {
  serveurMaintenant: string;
  statut: StatutSession;
  demarreLe: string | null;
  effectif: number;
  participants: ParticipantSuivi[];
  absents: AbsentSuivi[];
  demandes: DemandeSuivi[];
  /** Salle d'attente et examen en cours (A1 : reprise sur un autre téléphone) ; null sinon. */
  code: CodeAffiche | null;
  compteurs: CompteursSuivi;
  /** Chrono global : échéance la plus tardive des passages en cours (compte à rebours) ; null sinon. */
  finLe: string | null;
  /** Mode du chrono de l'instantané ; null avant le départ. */
  modeChrono: ModeChrono | null;
  /** Les 10 faits notables les plus récents de la session, du plus récent au plus ancien. */
  alertes: AlerteSuivi[];
};

export type VueProjection = {
  serveurMaintenant: string;
  statut: StatutSession;
  demarreLe: string | null;
  effectif: number;
  /** « Léa D. » : prénom et initiale du nom, sur un écran vu de toute la salle. */
  connectes: string[];
  absents: string[];
  /** Salle d'attente seulement (amendement A1). */
  code: CodeAffiche | null;
};
