/**
 * Règles du serveur MCP (spec §10 et §11.2 ; décisions D3 à D5 du plan du lot 8) : format des jetons,
 * lecture de l'en-tête Bearer, bornes et limite de débit. Fonctions pures, partagées par le module `mcp`
 * et la page « Connexion MCP ».
 */

export const PORTEES_MCP = ["lecture", "ecriture"] as const;
export type PorteeMcp = (typeof PORTEES_MCP)[number];

export const LIBELLES_PORTEE_MCP: Record<PorteeMcp, string> = {
  lecture: "Lecture seule",
  ecriture: "Lecture et écriture",
};

/** Préfixe des jetons : un jeton de Carreau se reconnaît dans un fichier de configuration (spec §10). */
export const PREFIXE_JETON_MCP = "carreau_";

/** `carreau_` suivi de 32 octets aléatoires en base64url sans remplissage (43 caractères). */
export const FORMAT_JETON_MCP = /^carreau_[A-Za-z0-9_-]{43}$/;

/** Caractères gardés en base pour reconnaître un jeton dans la liste : `carreau_` et 4 caractères aléatoires. */
export const LONGUEUR_PREFIXE_JETON_MCP = 12;

export const LIMITES_JETONS_MCP = { nomMax: 60, actifsMax: 10 } as const;

/** 60 requêtes par minute et par jeton (spec §11.2) ; au-delà, une minute de blocage. */
export const REGLE_LIMITE_MCP = { seuil: 60, fenetreSecondes: 60, blocageSecondes: 60 } as const;

/** Corps d'une requête MCP : 512 Kio au plus (spec §10). */
export const OCTETS_MAX_CORPS_MCP = 512 * 1024;

/** `dernier_usage_le` n'est écrit qu'une fois par minute au plus (spec §10). */
export const INTERVALLE_USAGE_JETON_MS = 60 * 1000;

export const MESSAGE_JETON_ABSENT =
  "Jeton MCP absent, invalide ou révoqué : ajoute l'en-tête « Authorization: Bearer <jeton> » avec un jeton actif (Carreau, menu Connexion MCP).";

export const MESSAGE_JETON_LECTURE =
  "Ce jeton est en lecture seule : il ne permet ni de créer ni de modifier un QCM. Crée un jeton « Lecture et écriture » dans Carreau (menu Connexion MCP).";

export const MESSAGE_LIMITE_JETONS = `Tu as déjà ${LIMITES_JETONS_MCP.actifsMax} jetons actifs : révoque celui que tu n'utilises plus.`;

export const MESSAGE_CORPS_MCP = "Requête trop volumineuse.";

const ENTETE_BEARER = /^bearer[ \t]+(\S+)[ \t]*$/i;

/** Jeton d'un en-tête `Authorization: Bearer <jeton>`, s'il a le bon format ; null sinon (aucune requête à faire). */
export function lireJetonBearer(entete: string | null): string | null {
  const jeton = entete?.match(ENTETE_BEARER)?.[1];
  return jeton !== undefined && FORMAT_JETON_MCP.test(jeton) ? jeton : null;
}

/** Début d'un jeton gardé en base et affiché dans la liste (« carreau_Ab3x… »). */
export function prefixeJetonMcp(jeton: string): string {
  return jeton.slice(0, LONGUEUR_PREFIXE_JETON_MCP);
}
