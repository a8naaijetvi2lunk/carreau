/**
 * Vues interrogées par l'enseignant (spec §7, plan du lot 4) : page de pilotage (suivi) et écran
 * projeté. Types seuls, partagés par le module sessions et les pages.
 */
import type { MotifDemande, StatutSession } from "./regles-session";

/** Code affiché (« K7M 4QP »), lien du QR code, adresse de saisie et QR code en URI `data:`. */
export type CodeAffiche = {
  code: string;
  secondesRestantes: number;
  lien: string;
  adresse: string;
  qrCode: string;
};

export type ParticipantSuivi = {
  participationId: string;
  nom: string;
  prenom: string;
  tiersTemps: boolean;
  informationLue: boolean;
};

export type AbsentSuivi = { etudiantId: string; nom: string; prenom: string };

export type DemandeSuivi = {
  demandeId: string;
  nom: string;
  prenom: string;
  motif: MotifDemande;
  creeLe: string;
};

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
