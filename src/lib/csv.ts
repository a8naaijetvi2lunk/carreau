/**
 * CSV pour Excel en français (spec §9.1, décision D8 du plan du lot 7) : BOM UTF-8, séparateur « ; »,
 * fins de ligne CRLF. Un texte qui commencerait une formule de tableur est neutralisé par une
 * apostrophe (CWE-1236) ; un nombre ne l'est jamais (il deviendrait du texte).
 */

export type CelluleCsv = string | number | null;

const BOM = new Uint8Array([0xef, 0xbb, 0xbf]);
const DEBUT_DE_FORMULE = /^[=+\-@\t\r]/;
const A_ENTOURER = /[;"\r\n]/;

/** Une cellule : nombre à virgule, texte neutralisé puis entre guillemets s'il le faut, vide pour null. */
export function celluleCsv(valeur: CelluleCsv): string {
  if (valeur === null) return "";
  if (typeof valeur === "number") return String(valeur).replace(".", ",");
  const neutralise = DEBUT_DE_FORMULE.test(valeur) ? `'${valeur}` : valeur;
  return A_ENTOURER.test(neutralise) ? `"${neutralise.replaceAll('"', '""')}"` : neutralise;
}

/** Fichier complet, BOM compris. */
export function octetsCsv(lignes: readonly (readonly CelluleCsv[])[]): Uint8Array {
  const texte = lignes.map((ligne) => `${ligne.map(celluleCsv).join(";")}\r\n`).join("");
  const corps = new TextEncoder().encode(texte);
  const octets = new Uint8Array(BOM.length + corps.length);
  octets.set(BOM, 0);
  octets.set(corps, BOM.length);
  return octets;
}
