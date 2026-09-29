/**
 * Lecture d'une source d'import (décision D7 du plan du lot 2) : fichier CSV ou XLSX, ou texte
 * collé depuis un tableur, rendu en tableau de cellules (une ligne du tableau par ligne de la
 * source, pour que les numéros de ligne des rejets correspondent au fichier). Le type se décide
 * sur les octets, jamais sur l'extension.
 */
import "server-only";
import Papa from "papaparse";
import { readSheet, type SheetData } from "read-excel-file/node";
import { erreurs } from "@/lib/erreurs";
import { verifierArchive } from "./archive";
import { MESSAGES_IMPORT, TAILLE_MAX_IMPORT_OCTETS } from "./messages";

export type Cellule = string | number | boolean | null;

export type SourceImport =
  { type: "fichier"; nom: string; octets: Uint8Array } | { type: "texte"; texte: string };

const SIGNATURE_ZIP = [0x50, 0x4b, 0x03, 0x04] as const;
const SIGNATURE_XLS = [0xd0, 0xcf, 0x11, 0xe0] as const;
const BOM_UTF8 = [0xef, 0xbb, 0xbf] as const;

function commencePar(octets: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((octet, i) => octets[i] === octet);
}

/** Texte d'un fichier : BOM UTF-8 retiré ; UTF-8 strict, sinon Windows-1252 (CSV « point-virgule » d'Excel). */
export function decoderTexte(octets: Uint8Array): string {
  const sansBom = commencePar(octets, BOM_UTF8) ? octets.subarray(BOM_UTF8.length) : octets;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(sansBom);
  } catch {
    return new TextDecoder("windows-1252").decode(sansBom);
  }
}

/**
 * Séparateur lu sur la première ligne non vide : tabulation (collage depuis un tableur), sinon
 * « ; » (CSV d'Excel en français), sinon « , ». La détection de papaparse échoue dès qu'une ligne
 * vide traîne dans le fichier.
 */
export function detecterSeparateur(texte: string): "\t" | ";" | "," {
  const premiere = texte.split(/\r\n|\n|\r/).find((ligne) => ligne.trim() !== "") ?? "";
  if (premiere.includes("\t")) return "\t";
  if (premiere.includes(";")) return ";";
  return ",";
}

/** Texte tabulaire → cellules. Un guillemet mal fermé refuse tout le fichier (il a pu avaler des lignes). */
export function lireTexteTabulaire(texte: string): Cellule[][] {
  const sansBom = texte.replace(/^﻿/, "");
  const resultat = Papa.parse<string[]>(sansBom, {
    delimiter: detecterSeparateur(sansBom),
    skipEmptyLines: false,
  });
  const guillemet = resultat.errors.find((erreur) => erreur.type === "Quotes");
  if (guillemet) throw erreurs.validation(MESSAGES_IMPORT.guillemet((guillemet.row ?? 0) + 1));
  return resultat.data;
}

function celluleXlsx(valeur: unknown): Cellule {
  if (typeof valeur === "string" || typeof valeur === "number" || typeof valeur === "boolean") return valeur;
  if (valeur instanceof Date) return valeur.toISOString().slice(0, 10);
  return null;
}

async function lireXlsx(octets: Uint8Array): Promise<Cellule[][]> {
  verifierArchive(octets);
  // `ReturnType<typeof readSheet>` ne peut viser que la dernière signature surchargée (celle avec
  // schéma) : elle ne correspond pas à l'appel ci-dessous, d'où le type explicite.
  let lignes: SheetData<number>;
  try {
    lignes = await readSheet(Buffer.from(octets));
  } catch {
    // Classeur OpenDocument, archive sans feuille, XML invalide… : un seul message (décision D8).
    throw erreurs.validation(MESSAGES_IMPORT.illisible);
  }
  return lignes.map((ligne) => ligne.map(celluleXlsx));
}

/** Source d'import → tableau de cellules (première feuille pour un classeur). */
export async function lireSource(source: SourceImport): Promise<Cellule[][]> {
  if (source.type === "texte") {
    if (Buffer.byteLength(source.texte, "utf8") > TAILLE_MAX_IMPORT_OCTETS) {
      throw erreurs.validation(MESSAGES_IMPORT.tropGros);
    }
    if (source.texte.trim() === "") throw erreurs.validation(MESSAGES_IMPORT.texteVide);
    return lireTexteTabulaire(source.texte);
  }
  const { octets } = source;
  if (octets.length === 0) throw erreurs.validation(MESSAGES_IMPORT.fichierAbsent);
  if (octets.length > TAILLE_MAX_IMPORT_OCTETS) throw erreurs.validation(MESSAGES_IMPORT.tropGros);
  if (commencePar(octets, SIGNATURE_XLS)) throw erreurs.validation(MESSAGES_IMPORT.xls);
  if (commencePar(octets, SIGNATURE_ZIP)) return lireXlsx(octets);
  const texte = decoderTexte(octets);
  if (texte.trim() === "") throw erreurs.validation(MESSAGES_IMPORT.fichierVide);
  return lireTexteTabulaire(texte);
}
