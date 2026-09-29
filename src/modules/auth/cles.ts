/** Clés et règles du limiteur de l'authentification (spec §11.2, décision D8 du plan du lot 1). */
import { sha256Hex } from "@/lib/jetons";
import type { RegleLimite } from "@/modules/limiteur";

/** 5 échecs en 15 min → blocage 15 min, pour toute adresse saisie (connue ou non). */
export const REGLE_CONNEXION_COMPTE: RegleLimite = { seuil: 5, fenetreSecondes: 900, blocageSecondes: 900 };

/** 100 échecs en 15 min, pour les adresses sans compte : toute une salle partage une IP. */
export const REGLE_CONNEXION_IP: RegleLimite = { seuil: 100, fenetreSecondes: 900, blocageSecondes: 900 };

/** 5 codes TOTP faux en 15 min → blocage 15 min. */
export const REGLE_DOUBLE_AUTH: RegleLimite = { seuil: 5, fenetreSecondes: 900, blocageSecondes: 900 };

/** Adresse hachée : aucune adresse en clair dans la table du limiteur. `email` déjà normalisé. */
export function cleConnexionCompte(email: string): string {
  return `connexion:compte:${sha256Hex(email)}`;
}

export function cleConnexionIp(ip: string): string {
  return `connexion:ip:${ip}`;
}

export function cleDoubleAuth(utilisateurId: string): string {
  return `double_auth:compte:${utilisateurId}`;
}
