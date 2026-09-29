/** Listes de classe des tests de bout en bout : un CSV d'Excel et un classeur XLSX. */
import writeExcelFile from "write-excel-file/node";

/** Les 30 étudiants valides de la liste du TD2 (nom en majuscules, prénom), dans l'ordre du fichier. */
export const ETUDIANTS = [
  ["DUPONT", "Léa"],
  ["MARTIN", "Inès"],
  ["BERNARD", "Tom"],
  ["DUPRÉ", "Sacha"],
  ["DUPUIS", "Hugo"],
  ["FOURNIER", "Jade"],
  ["GIRARD", "Enzo"],
  ["LEROY", "Chloé"],
  ["MOREAU", "Lucas"],
  ["LEFEBVRE", "Emma"],
  ["ROUX", "Nathan"],
  ["FAURE", "Manon"],
  ["ANDRÉ", "Louis"],
  ["MERCIER", "Camille"],
  ["BLANC", "Théo"],
  ["GUÉRIN", "Zoé"],
  ["BOYER", "Jules"],
  ["GARNIER", "Lina"],
  ["CHEVALIER", "Noah"],
  ["FRANÇOIS", "Rose"],
  ["LEGRAND", "Adam"],
  ["GAUTHIER", "Anna"],
  ["PERRIN", "Gabriel"],
  ["ROBIN", "Alice"],
  ["CLÉMENT", "Raphaël"],
  ["MORIN", "Louise"],
  ["NICOLAS", "Arthur"],
  ["HENRY", "Juliette"],
  ["ROUSSEL", "Paul"],
  ["MATHIEU", "Clara"],
] as const;

/**
 * Liste du TD2 comme l'enregistre Excel en « CSV UTF-8 » (BOM, « ; », fins de ligne CRLF) :
 * 30 étudiants valides dont GIRARD Enzo et LEROY Chloé en tiers-temps, plus deux lignes rejetées —
 * BRUNET sans prénom (ligne 13) et un doublon de DUPUIS Hugo (ligne 33, doublon de la ligne 6).
 */
export function listeTd2Csv(): Buffer {
  const lignes: string[] = ["Nom;Prénom;Tiers-temps"];
  for (const [nom, prenom] of ETUDIANTS) {
    lignes.push(`${nom};${prenom};${nom === "GIRARD" || nom === "LEROY" ? "oui" : "non"}`);
  }
  lignes.splice(12, 0, "BRUNET;;non");
  lignes.push("Dupuis;hugo;non");
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(`${lignes.join("\r\n")}\r\n`, "utf8")]);
}

/** Classeur XLSX d'une feuille. */
export async function classeurXlsx(lignes: (string | boolean)[][]): Promise<Buffer> {
  return writeExcelFile(lignes.map((ligne) => ligne.map((valeur) => ({ value: valeur })))).toBuffer();
}
