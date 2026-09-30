/** Clés et règles du limiteur des entrées étudiantes (spec §11.2, décision D15 du plan du lot 4). */
import { sha256Hex } from "@/lib/jetons";
import type { RegleLimite } from "@/modules/limiteur";

/** Toute une salle partage une IP : limite large (spec §11.2, amendement A4 du plan du lot 5). */
export const REGLE_REJOINDRE_IP: RegleLimite = { seuil: 600, fenetreSecondes: 60, blocageSecondes: 60 };
export const REGLE_RECHERCHE: RegleLimite = { seuil: 30, fenetreSecondes: 60, blocageSecondes: 60 };
export const REGLE_RECLAMER: RegleLimite = { seuil: 10, fenetreSecondes: 60, blocageSecondes: 60 };
export const REGLE_ETAT: RegleLimite = { seuil: 120, fenetreSecondes: 60, blocageSecondes: 60 };
export const REGLE_INFORMATION: RegleLimite = { seuil: 30, fenetreSecondes: 60, blocageSecondes: 60 };

export function cleRejoindreIp(ip: string): string {
  return `etudiant:rejoindre:ip:${ip}`;
}

/** Ticket d'entrée : son nonce aléatoire, jamais le ticket signé. */
export function cleRecherche(nonce: string): string {
  return `etudiant:recherche:${nonce}`;
}

export function cleReclamer(nonce: string): string {
  return `etudiant:reclamer:${nonce}`;
}

/** Appareil : empreinte de son jeton, jamais le jeton en clair. */
export function cleEtatAppareil(jeton: string): string {
  return `etudiant:etat:${sha256Hex(jeton)}`;
}

export function cleEtatTicket(nonce: string): string {
  return `etudiant:etat:ticket:${nonce}`;
}

export function cleInformation(jeton: string): string {
  return `etudiant:information:${sha256Hex(jeton)}`;
}

/** Passage de l'examen (spec §11.2, décision D13 du plan du lot 5) : clés posées après avoir retrouvé la participation. */
export const REGLE_SELECTION: RegleLimite = { seuil: 120, fenetreSecondes: 60, blocageSecondes: 60 };
export const REGLE_REPONSE: RegleLimite = { seuil: 120, fenetreSecondes: 60, blocageSecondes: 60 };

export function cleSelection(participationId: string): string {
  return `etudiant:selection:${participationId}`;
}

export function cleReponse(participationId: string): string {
  return `etudiant:reponse:${participationId}`;
}

export const REGLE_IMAGE: RegleLimite = { seuil: 240, fenetreSecondes: 60, blocageSecondes: 60 };

export function cleImage(participationId: string): string {
  return `etudiant:image:${participationId}`;
}

/** Événements de la page d'examen (spec §11.2, D7 du plan du lot 6) : 120 lots par minute et par participation. */
export const REGLE_EVENEMENTS: RegleLimite = { seuil: 120, fenetreSecondes: 60, blocageSecondes: 60 };

export function cleEvenements(participationId: string): string {
  return `etudiant:evenements:${participationId}`;
}
