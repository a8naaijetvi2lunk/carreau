/**
 * Règles des purges (spec §9.4 et §14, lot 10 ; décisions D1 à D4 du plan). Les durées de conservation
 * des données d'examen viennent des paramètres ; celles-ci sont fixes.
 */

/** Grâce accordée à une image non citée : le temps de l'ajouter à une question. */
export const DELAI_GRACE_IMAGES_MS = 24 * 60 * 60 * 1000;

/** Journal d'audit (amendement A3). */
export const CONSERVATION_JOURNAL_MOIS = 12;

/** Invitations utilisées ou annulées (amendement A4). */
export const CONSERVATION_INVITATIONS_CLOSES_JOURS = 30;

/** Clés du limiteur sans blocage actif. */
export const AGE_LIMITEUR_S = 24 * 60 * 60;

/** Étapes, dans l'ordre d'exécution : le journal en dernier, avant l'écriture du bilan. */
export const ETAPES_PURGE = [
  "evenements",
  "sessions",
  "images",
  "connexions",
  "jetons",
  "invitations",
  "limiteur",
  "journal",
] as const;
export type EtapePurge = (typeof ETAPES_PURGE)[number];

/**
 * Bilan d'une exécution : nombre de lignes supprimées par étape, null pour une étape en échec (nommée
 * dans `erreurs`). Conservation non renseignée : `evenements` et `sessions` valent 0.
 */
export type BilanPurges = {
  conservationRenseignee: boolean;
  evenements: number | null;
  sessions: number | null;
  images: { lignes: number; fichiers: number; temporaires: number } | null;
  connexions: number | null;
  jetons: number | null;
  invitations: number | null;
  limiteur: number | null;
  journal: number | null;
  erreurs: EtapePurge[];
};

/** Statut HTTP de la route : 500 seulement si toutes les étapes ont échoué (décision D4). */
export function statutBilan(bilan: Pick<BilanPurges, "erreurs">): number {
  return bilan.erreurs.length === ETAPES_PURGE.length ? 500 : 200;
}
