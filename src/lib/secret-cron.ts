import { createHash, timingSafeEqual } from "node:crypto";

const ENTETE_BEARER = /^bearer[ \t]+(\S+)$/i;

function empreinte(valeur: string): Buffer {
  return createHash("sha256").update(valeur, "utf8").digest();
}

/**
 * Vrai si l'en-tête Authorization porte exactement le secret de la tâche planifiée (décision D5 du
 * plan du lot 10). Comparaison à temps constant sur les empreintes SHA-256 : ni le contenu ni la
 * longueur du secret ne se déduisent du temps de réponse. Aucun secret configuré : tout est refusé.
 */
export function secretCronValide(entete: string | null, attendu: string | undefined): boolean {
  if (!attendu || entete === null) return false;
  const presente = ENTETE_BEARER.exec(entete.trim())?.[1];
  if (!presente) return false;
  return timingSafeEqual(empreinte(presente), empreinte(attendu));
}
