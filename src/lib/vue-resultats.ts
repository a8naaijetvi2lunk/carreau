/**
 * Vues des résultats (spec §9.1, plan du lot 7) : tableau d'une session et de ses rattrapages, liste
 * des examens terminés. Types seuls, partagés par le module resultats et les pages.
 */
import type { StatutSession } from "./regles-session";

export type StatutResultat = "present" | "en_cours" | "absent";

/** Rattrapage prévu (salle d'attente) ou en cours pour un absent (D2 et D5 du plan du lot 7). */
export type RattrapagePrevu = {
  sessionId: string;
  statut: "attente" | "en_cours";
  creneauPrevuLe: string | null;
};

export type LigneResultat = {
  etudiantId: string;
  nom: string;
  prenom: string;
  /** Tiers-temps figé au départ pour un passage, celui de la fiche pour un absent. */
  tiersTemps: boolean;
  statut: StatutResultat;
  /** Participation (présent ou en cours) ; null pour un absent. */
  participationId: string | null;
  /** Session d'origine ou rattrapage où l'examen a été passé ; null pour un absent. */
  passage: "session" | "rattrapage" | null;
  /** Examen passé en rattrapage : départ du rattrapage (ISO). */
  rattrapageLe: string | null;
  note: number | null;
  points: number | null;
  bonnes: number | null;
  dureeS: number | null;
  indice: number | null;
  /** Absent : rattrapage prévu ou en cours ; null sinon. */
  rattrapagePrevu: RattrapagePrevu | null;
};

export type StatistiquesResultats = {
  moyenne: number | null;
  mediane: number | null;
  presents: number;
  effectif: number;
  /** Présents dont l'indice de suspicion atteint 60. */
  indicesEleves: number;
};

export type VueResultats = {
  /** Session d'origine (la page d'un rattrapage redirige vers celle-ci). */
  sessionId: string;
  titre: string;
  classe: string;
  demarreLe: string;
  /** Durée de l'examen (« 20 min », « 30 s par question », « Sans limite de temps »). */
  duree: string;
  questions: number;
  noteVisible: boolean;
  correctionVisible: boolean;
  /** Un rattrapage en salle d'attente ou en cours : la correction attend sa fin (A1). */
  rattrapageOuvert: boolean;
  statistiques: StatistiquesResultats;
  lignes: LigneResultat[];
};

export type ResultatsSession =
  | { disponible: true; vue: VueResultats }
  | { disponible: false; sessionId: string; titre: string; classe: string; statut: StatutSession };

/** Un examen terminé dans la liste des résultats. */
export type ResumeResultats = {
  sessionId: string;
  titre: string;
  classe: string;
  demarreLe: string;
  termineLe: string;
  presents: number;
  effectif: number;
  moyenne: number | null;
};
