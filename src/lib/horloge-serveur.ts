/** Heure du serveur vue du navigateur (spec §6.3 : le compte à rebours est calé sur `serveurMaintenant`). */

/** Décalage (ms) de l'horloge du serveur sur celle du navigateur, mesuré à la réception d'une réponse. */
export function decalageServeurMs(serveurMaintenant: string, recueLocaleMs: number): number {
  const serveur = Date.parse(serveurMaintenant);
  return Number.isNaN(serveur) ? 0 : serveur - recueLocaleMs;
}

/** Secondes entières (≥ 0) avant `cible`, d'après l'heure locale corrigée du décalage. */
export function secondesAvant(cible: string, decalageMs: number, maintenantLocalMs: number): number {
  const restant = Date.parse(cible) - (maintenantLocalMs + decalageMs);
  return Number.isNaN(restant) ? 0 : Math.max(0, Math.ceil(restant / 1000));
}
