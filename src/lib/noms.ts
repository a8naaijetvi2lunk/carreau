/**
 * Normalisation des noms et prénoms d'étudiants (spec §6.2) : repère les homonymes d'une classe
 * et sert à la recherche d'un nom. Pure, sans dépendance : les services comme la page de la
 * classe l'utilisent (décision D6 du plan du lot 2 : dans `lib`, que `app` peut importer).
 */

/**
 * Minuscules, accents et caractères invisibles retirés (NFD, puis catégorie Unicode Cf : traits
 * d'union conditionnels, espaces de largeur nulle, BOM…), ligatures « œ » et « æ » développées,
 * apostrophes (dont ‘ et ´) et tirets remplacés par une espace, espaces réduits, rognée.
 * « Jean-Pierre D’Arc » → « jean pierre d arc ».
 */
export function normaliserNom(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{Cf}/gu, "")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/['\u2019\u02bc\u2018\u00b4`]/g, " ")
    .replace(/[-\u2010-\u2015\u2212]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clé d'homonymie à partir de nom et prénom déjà normalisés (colonnes `nom_normalise` et `prenom_normalise`). */
export function cleNormalisee(nomNormalise: string, prenomNormalise: string): string {
  return JSON.stringify([nomNormalise, prenomNormalise]);
}

/** Clé d'homonymie d'un étudiant dans sa classe : nom et prénom normalisés. */
export function cleEtudiant(nom: string, prenom: string): string {
  return cleNormalisee(normaliserNom(nom), normaliserNom(prenom));
}

/**
 * Vrai si la saisie commence le nom, le prénom, « prénom nom » ou « nom prénom » (comparaison
 * normalisée). Une saisie vide après normalisation correspond à tout le monde.
 */
export function correspondANom(recherche: string, nom: string, prenom: string): boolean {
  const debut = normaliserNom(recherche);
  if (debut === "") return true;
  const n = normaliserNom(nom);
  const p = normaliserNom(prenom);
  return [n, p, `${p} ${n}`, `${n} ${p}`].some((texte) => texte.startsWith(debut));
}
