/**
 * Règles des résultats (spec §9.1 ; décisions D5 et D8 du plan du lot 7) : statistiques, tri du
 * tableau et des exports, libellés. Pures : partagées par le module resultats et les pages.
 */
import { saisieHeureDeParis } from "./dates";
import { nomComplet } from "./regles-session";
import { pluriel } from "./textes";
import type { LigneResultat, StatutResultat } from "./vue-resultats";

/** Indice élevé : carte « Indice de suspicion ≥ 60 » et couleur orange foncé (D14 du lot 6). */
export const SEUIL_INDICE_ELEVE = 60;

export const LIBELLES_STATUT_RESULTAT: Record<StatutResultat, string> = {
  present: "Présent",
  en_cours: "En cours",
  absent: "Absent",
};

function arrondi(valeur: number): number {
  return Math.round(valeur * 100) / 100;
}

/** Moyenne arrondie au centième ; null sans valeur. */
export function moyenne(valeurs: readonly number[]): number | null {
  if (valeurs.length === 0) return null;
  return arrondi(valeurs.reduce((somme, v) => somme + v, 0) / valeurs.length);
}

/** Médiane arrondie au centième (moyenne des deux valeurs centrales pour un nombre pair) ; null sans valeur. */
export function mediane(valeurs: readonly number[]): number | null {
  if (valeurs.length === 0) return null;
  const tries = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(tries.length / 2);
  const haut = tries[milieu] ?? 0;
  return arrondi(tries.length % 2 === 1 ? haut : ((tries[milieu - 1] ?? 0) + haut) / 2);
}

const RANG_STATUT: Record<StatutResultat, number> = { present: 0, en_cours: 1, absent: 2 };

type Nomme = Pick<LigneResultat, "nom" | "prenom">;

/** Ordre alphabétique « NOM Prénom » (exports, D8). */
export function comparerNoms(a: Nomme, b: Nomme): number {
  return nomComplet(a.prenom, a.nom).localeCompare(nomComplet(b.prenom, b.nom), "fr");
}

/** Tableau des résultats (D5) : présents par note décroissante puis nom, en cours, absents par nom. */
export function comparerLignes(a: LigneResultat, b: LigneResultat): number {
  return (
    RANG_STATUT[a.statut] - RANG_STATUT[b.statut] || (b.note ?? -1) - (a.note ?? -1) || comparerNoms(a, b)
  );
}

/** Colonnes du CSV et de la feuille « Synthèse » (D8). */
export const EN_TETES_SYNTHESE = [
  "Nom",
  "Prénom",
  "Tiers-temps",
  "Passage",
  "Statut",
  "Note sur 20",
  "Points",
  "Bonnes réponses",
  "Durée (s)",
  "Indice de suspicion",
] as const;

/** Colonnes du tableau d'une feuille de question (D8). */
export const EN_TETES_QUESTION = ["Nom", "Prénom", "Réponse", "Résultat", "Points"] as const;

/** Une ligne des résultats, dans l'ordre de `EN_TETES_SYNTHESE` ; null pour une cellule vide. */
export function celluleSynthese(l: LigneResultat): (string | number | null)[] {
  const passage = l.passage === "rattrapage" ? "Rattrapage" : l.passage === "session" ? "Session" : null;
  return [
    l.nom,
    l.prenom,
    l.tiersTemps ? "Oui" : "Non",
    passage,
    LIBELLES_STATUT_RESULTAT[l.statut],
    l.note,
    l.points,
    l.bonnes,
    l.dureeS,
    l.indice,
  ];
}

const TITRE_FICHIER_MAX = 60;
const MARQUES = /\p{M}/gu;

/** « resultats-algorithmique-controle-2-2026-09-29.csv » : titre sans accents, date du départ à Paris (D8). */
export function nomFichierExport(titre: string, le: Date, extension: "csv" | "xlsx"): string {
  const mots = titre
    .normalize("NFD")
    .replace(MARQUES, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, TITRE_FICHIER_MAX)
    .replace(/-+$/, "");
  const date = saisieHeureDeParis(le).slice(0, 10);
  return mots === "" ? `resultats-${date}.${extension}` : `resultats-${mots}-${date}.${extension}`;
}

/** Lettre d'une réponse dans l'ordre du QCM : 0 → « A ». */
export function lettre(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Résultat d'une sélection (index d'origine) : tout ou rien (spec §6.6). */
export function resultatQuestion(
  selection: readonly number[],
  question: { propositions: readonly { correcte: boolean }[] },
): "Juste" | "Faux" | "Sans réponse" {
  if (selection.length === 0) return "Sans réponse";
  const correctes = question.propositions.flatMap((p, index) => (p.correcte ? [index] : []));
  const choisies = new Set(selection);
  const exacte = choisies.size === correctes.length && correctes.every((index) => choisies.has(index));
  return exacte ? "Juste" : "Faux";
}

/** Sous le rapport (maquette « Rapport étudiant ») : jamais un indice sans ce rappel. */
export const MENTION_RAPPORT =
  "L’indice est une estimation calculée à partir des événements enregistrés. Ce n’est pas une preuve : à croiser avec ce que tu as observé en salle.";

/** Textes de la chronologie du rapport (D10), montrés à l'enseignant seulement. */
export const TEXTES_CHRONOLOGIE = {
  debut: "Début de l’examen",
  fin: (repondues: number, total: number) =>
    `Fin · ${pluriel(repondues, "réponse", "réponses")} sur ${total}`,
  sortie: "Sortie de l’application",
  retour: "Retour dans l’examen",
  focus: "Perte de focus",
  coupure: "Coupure réseau (non comptée)",
  pressePapiers: "Copier-coller",
  ecranPartage: "Écran partagé (heuristique)",
  secondAppareil: "Tentative depuis un second appareil",
  rechargement: "Rechargement de la page",
  reponse: "Réponse validée",
  reponseRapide: (secondes: number) => `Réponse validée ${secondes} s après le retour`,
  echeance: "Temps écoulé : dernière sélection enregistrée",
} as const;
