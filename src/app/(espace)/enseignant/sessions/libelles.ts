import { formaterDateCourte } from "@/lib/dates";
import { nomComplet } from "@/lib/regles-session";
import type { StatutSession } from "@/lib/regles-session";
import type { ParticipantSuivi, StatutSuivi, VueSuivi } from "@/lib/vue-session";

/** Couleur de l'étiquette de statut d'une session (maquette « Accueil »). */
export const TONS_STATUT_SESSION: Record<StatutSession, "sombre" | "bleu" | "neutre"> = {
  attente: "bleu",
  en_cours: "sombre",
  terminee: "neutre",
  annulee: "neutre",
};

type SessionDatee = {
  statut: StatutSession;
  creneauPrevuLe: Date | null;
  creeLe: Date;
  demarreLe: Date | null;
  termineLe: Date | null;
};

/** Date utile d'une session dans une liste : créneau prévu, démarrage, fin ou annulation. */
export function libelleQuand(s: SessionDatee): string {
  if (s.statut === "en_cours") return `Démarrée le ${formaterDateCourte(s.demarreLe ?? s.creeLe)}`;
  if (s.statut === "terminee") return `Terminée le ${formaterDateCourte(s.termineLe ?? s.creeLe)}`;
  if (s.statut === "annulee") return `Annulée le ${formaterDateCourte(s.termineLe ?? s.creeLe)}`;
  return s.creneauPrevuLe ? `Prévue le ${formaterDateCourte(s.creneauPrevuLe)}` : "Sans créneau";
}

/** Avancement d'un participant sur la page de pilotage (décision D15 du plan du lot 5). */
export function libelleAvancement(avancement: {
  repondues: number;
  total: number;
  terminee: boolean;
}): string {
  if (avancement.terminee) return "Terminé";
  return `Question ${Math.min(avancement.repondues + 1, avancement.total)} / ${avancement.total}`;
}

/** Statut d'une ligne du tableau de bord : celui du suivi, ou « absent » (jamais connecté). */
export type StatutLigne = StatutSuivi | "absent";

export const LIBELLES_STATUT_SUIVI: Record<StatutLigne, string> = {
  attente: "En attente",
  en_cours: "En cours",
  deconnecte: "Déconnecté",
  terminee: "Terminé",
  absent: "Absent",
};

/** Couleur de l'indice (D14 du plan du lot 6) : 60 et plus orange foncé, 20 à 59 ambre, sinon gris. */
export function tonIndice(indice: number): "fort" | "moyen" | "faible" {
  if (indice >= 60) return "fort";
  if (indice >= 20) return "moyen";
  return "faible";
}

/** Progression au tableau de bord : question courante, ou toutes les questions une fois le passage fini. */
export function libelleProgression(avancement: NonNullable<ParticipantSuivi["avancement"]>): string {
  if (avancement.terminee) return `${avancement.total} / ${avancement.total}`;
  return `Q${Math.min(avancement.repondues + 1, avancement.total)} / ${avancement.total}`;
}

export type LigneTableau = {
  cle: string;
  nom: string;
  tiersTemps: boolean;
  statut: StatutLigne;
  progression: string | null;
  indice: number | null;
  dernierFait: string | null;
};

/** Toute la classe (D14) : participants puis jamais connectés, par indice décroissant puis par nom. */
export function lignesTableau(suivi: Pick<VueSuivi, "participants" | "absents">): LigneTableau[] {
  const lignes: LigneTableau[] = [
    ...suivi.participants.map((p) => ({
      cle: p.participationId,
      nom: nomComplet(p.prenom, p.nom),
      tiersTemps: p.tiersTemps,
      statut: p.statut,
      progression: p.avancement ? libelleProgression(p.avancement) : null,
      indice: p.indice,
      dernierFait: p.dernierFait,
    })),
    ...suivi.absents.map((a) => ({
      cle: a.etudiantId,
      nom: nomComplet(a.prenom, a.nom),
      tiersTemps: false,
      statut: "absent" as const,
      progression: null,
      indice: null,
      dernierFait: null,
    })),
  ];
  return lignes.sort((a, b) => (b.indice ?? -1) - (a.indice ?? -1) || a.nom.localeCompare(b.nom, "fr"));
}

export type FiltreSuivi = "tous" | "en_cours" | "termines" | "absents";

export const FILTRES_SUIVI: { filtre: FiltreSuivi; libelle: string }[] = [
  { filtre: "tous", libelle: "Tous" },
  { filtre: "en_cours", libelle: "En cours" },
  { filtre: "termines", libelle: "Terminés" },
  { filtre: "absents", libelle: "Absents" },
];

export function filtrerLignes(lignes: LigneTableau[], filtre: FiltreSuivi): LigneTableau[] {
  switch (filtre) {
    case "tous":
      return lignes;
    case "en_cours":
      return lignes.filter((l) => l.statut === "en_cours" || l.statut === "deconnecte");
    case "termines":
      return lignes.filter((l) => l.statut === "terminee");
    case "absents":
      return lignes.filter((l) => l.statut === "absent");
  }
}
