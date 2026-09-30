/**
 * Vues des résultats (spec §9.1, plan du lot 7) : tableau d'une session et de ses rattrapages, liste
 * des examens terminés. Types seuls, partagés par le module resultats et les pages.
 */
import type { StatutSession } from "./regles-session";
import type { Signal } from "./regles-surveillance";

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

/** Repère (début, fin), fait mineur ou fait notable de la chronologie (D10). */
export type SorteChronologie = "repere" | "mineur" | "notable";

export type EntreeChronologie = {
  le: string;
  /** Numéro de la question dans l'ordre du QCM (D7) ; null hors question. */
  question: number | null;
  texte: string;
  dureeS: number | null;
  sorte: SorteChronologie;
};

/** Ligne du détail de l'indice (D9) : ligne stockée, libellé, précision recalculée (« 38 s au total »). */
export type LigneDetailIndice = {
  signal: Signal;
  libelle: string;
  nombre: number;
  points: number;
  precision: string | null;
};

/** Un examen de la même fiche étudiant chez le même enseignant (spec §8.4). */
export type PointEvolution = {
  participationId: string;
  titre: string;
  le: string;
  note: number;
  indice: number | null;
  courante: boolean;
};

export type VueRapport = {
  /** Session d'origine de l'examen : retour aux résultats. */
  sessionId: string;
  participationId: string;
  nom: string;
  prenom: string;
  classe: string;
  titre: string;
  /** Départ de la session où l'examen a été passé. */
  le: string;
  rattrapage: boolean;
  tiersTemps: boolean;
  note: number;
  points: number;
  bonnes: number;
  questions: number;
  dureeS: number;
  indice: { valeur: number; version: number; lignes: LigneDetailIndice[]; plafonne: boolean } | null;
  chronologie: EntreeChronologie[];
  evolution: PointEvolution[];
};

export type RapportEtudiant =
  | { disponible: true; vue: VueRapport }
  | { disponible: false; sessionId: string; nom: string; prenom: string };
