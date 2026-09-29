/** Bornes et messages de l'import d'une liste d'étudiants (décisions D7 à D11 du plan du lot 2). */

/** 512 Kio : une classe tient en quelques Kio ; reste sous la limite de 1 Mo du corps d'une Server Action. */
export const TAILLE_MAX_IMPORT_OCTETS = 512 * 1024;
/** Taille décompressée réelle maximale d'un classeur XLSX (bombe de décompression). */
export const MAX_DECOMPRESSE_OCTETS = 10 * 1024 * 1024;
export const MAX_ENTREES_ARCHIVE = 100;
export const MAX_LIGNES_IMPORT = 500;

export const MESSAGES_IMPORT = {
  fichierAbsent: "Choisis un fichier à importer.",
  texteVide: "Colle la liste des étudiants, ligne des titres comprise.",
  fichierVide: "Le fichier est vide.",
  tropGros: "La liste dépasse 512 Ko : une classe tient en quelques Ko, vérifie le fichier choisi.",
  xls: "Les fichiers .xls (Excel 97-2003) ne sont pas pris en charge : enregistre-le au format .xlsx ou .csv.",
  illisible: "Fichier illisible : enregistre-le au format .xlsx ou .csv, puis réessaie.",
  archiveTropVolumineuse:
    "Le classeur est trop volumineux une fois décompressé : enregistre la liste seule dans un nouveau fichier.",
  enTete:
    "La première ligne doit contenir les titres des colonnes Nom et Prénom (Tiers-temps est facultatif).",
  aucunEtudiant: "La liste ne contient aucun étudiant.",
  tropDeLignes: `La liste dépasse ${MAX_LIGNES_IMPORT} lignes : une classe compte ${MAX_LIGNES_IMPORT} étudiants au plus.`,
  guillemet: (ligne: number) => `Guillemet mal fermé à la ligne ${ligne} : corrige le fichier puis réessaie.`,
} as const;
