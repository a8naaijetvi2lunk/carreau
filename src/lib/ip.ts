/**
 * Adresse IP du client, pour le limiteur (spec §11.2).
 *
 * Derrière Nginx Proxy Manager, le client maîtrise le DÉBUT de `x-forwarded-for`
 * (le proxy ajoute l'IP réelle à la fin) : la valeur la plus à gauche n'est jamais lue.
 * Ordre : `x-real-ip` (écrasé par le proxy), sinon la dernière valeur de
 * `x-forwarded-for`, sinon « inconnue ». Tronquée à 100 caractères.
 * Toute une salle de classe partage souvent la même IP : ne jamais s'en servir seule
 * pour bloquer un compte.
 */
export const IP_INCONNUE = "inconnue";

const LONGUEUR_MAX_IP = 100;

export function lireIpClient(entetes: { get(nom: string): string | null }): string {
  const reelle = entetes.get("x-real-ip")?.trim();
  const derniere = entetes.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return (reelle || derniere || IP_INCONNUE).slice(0, LONGUEUR_MAX_IP);
}
