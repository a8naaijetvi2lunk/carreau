/**
 * Règles partagées des sessions d'examen (spec §4.3 et §6 ; plan du lot 4) : états, motifs et
 * bornes. Pure et sans import : le schéma de la base (chargé par drizzle-kit sans les alias de
 * tsconfig.json), les services et les écrans l'importent.
 */

export const STATUTS_SESSION = ["attente", "en_cours", "terminee", "annulee"] as const;
export type StatutSession = (typeof STATUTS_SESSION)[number];

/** Session de classe, ou rattrapage d'une session terminée (spec §4.3, décision D1 du plan du lot 7). */
export const TYPES_SESSION = ["classe", "rattrapage"] as const;
export type TypeSession = (typeof TYPES_SESSION)[number];

export const STATUTS_PARTICIPATION = ["attente", "en_cours", "terminee"] as const;
export type StatutParticipation = (typeof STATUTS_PARTICIPATION)[number];

export const MOTIFS_DEMANDE = ["second_appareil", "reprise"] as const;
export type MotifDemande = (typeof MOTIFS_DEMANDE)[number];

export const STATUTS_DEMANDE = ["en_attente", "autorisee", "refusee", "expiree"] as const;
export type StatutDemande = (typeof STATUTS_DEMANDE)[number];

/** Libellés affichés à l'enseignant (liste des sessions, pilotage). */
export const LIBELLES_STATUT_SESSION: Record<StatutSession, string> = {
  attente: "Salle d’attente",
  en_cours: "En cours",
  terminee: "Terminée",
  annulee: "Annulée",
};

/** Titre d'une demande d'appareil (maquette « Suivi en direct »). */
export const LIBELLES_MOTIF_DEMANDE: Record<MotifDemande, string> = {
  second_appareil: "Nom déjà utilisé sur un autre appareil",
  reprise: "Reprise sur un autre téléphone",
};

/** Bornes des sessions (décisions D3, D8, D10 et D12 du plan du lot 4). */
export const LIMITES_SESSION = {
  /** Sessions en salle d'attente ou en cours, par compte. */
  ouvertesParCompte: 50,
  /** Délai entre « Démarrer » et le début commun (spec §6.3). */
  delaiDemarrageMs: 5_000,
  /** Une demande d'appareil sans réponse expire au bout de 10 minutes. */
  dureeDemandeMs: 10 * 60_000,
  /** Saisie de la recherche d'un nom, en caractères après normalisation (spec §6.2). */
  rechercheMin: 3,
  rechercheMax: 100,
  /** Étudiants renvoyés par une recherche. */
  resultatsMax: 8,
  /** Créneau prévu : au plus 24 h dans le passé, au plus 365 jours à l'avance. */
  creneauPasseMaxMs: 24 * 3_600_000,
  creneauFuturMaxMs: 365 * 24 * 3_600_000,
  /** Étudiants choisis pour un rattrapage (une classe compte 500 étudiants au plus, lot 2). */
  rattrapageMax: 500,
} as const;

/** Tiers-temps (spec §6.5) : durée × 4/3, arrondie à la seconde supérieure. */
export function dureeAvecTiersTempsS(secondes: number): number {
  return Math.ceil((secondes * 4) / 3);
}

/** Nom affiché sur l'écran projeté : « Léa D. » (prénom et initiale du nom). */
export function nomCourt(prenom: string, nom: string): string {
  const initiale = Array.from(nom.trim())[0]?.toLocaleUpperCase("fr-FR") ?? "";
  return initiale === "" ? prenom : `${prenom} ${initiale}.`;
}

/** Nom affiché dans les listes : « DUPONT Léa » (maquette « Rejoindre »). */
export function nomComplet(prenom: string, nom: string): string {
  return `${nom.toLocaleUpperCase("fr-FR")} ${prenom}`;
}
