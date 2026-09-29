import { formaterDateCourte } from "@/lib/dates";
import type { StatutSession } from "@/lib/regles-session";

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
