/**
 * Analyse d'un tableau importé (décisions D9 à D11 du plan du lot 2) : repère les colonnes Nom,
 * Prénom et Tiers-temps sur la ligne des titres, puis sépare les lignes valides des lignes
 * rejetées, chacune avec son numéro de ligne dans le fichier et son motif. Ne lit pas la base.
 */
import "server-only";
import { erreurs } from "@/lib/erreurs";
import { cleEtudiant, normaliserNom } from "@/lib/noms";
import { nettoyerTexte, problemeNomEtudiant } from "../commun";
import type { Cellule } from "./lecture";
import { MAX_LIGNES_IMPORT, MESSAGES_IMPORT } from "./messages";

export type LigneImport = { numero: number; nom: string; prenom: string; tiersTemps: boolean | null };
export type RejetImport = { numero: number; motif: string };
export type AnalyseTableau = { lignes: LigneImport[]; rejets: RejetImport[]; colonneTiersTemps: boolean };

/** Titres reconnus, après `normaliserNom` et retrait du texte entre parenthèses (décision D9). */
const TITRES = {
  nom: ["nom", "nom de famille", "nom usuel", "nom patronymique"],
  prenom: ["prenom", "prenoms", "prenom usuel", "premier prenom"],
  tiersTemps: ["tiers temps", "tiers", "tt", "1/3 temps"],
} as const;

/** Valeurs de tiers-temps, après `normaliserNom` (décision D10) ; « - » se normalise en « ». */
const OUI = new Set(["oui", "o", "x", "1", "vrai", "true", "yes", "y", "tt", "tiers temps"]);
const NON = new Set(["", "non", "n", "0", "faux", "false", "no"]);

function texteCellule(cellule: Cellule | undefined): string {
  if (cellule === null || cellule === undefined) return "";
  if (typeof cellule === "boolean") return cellule ? "oui" : "non";
  return nettoyerTexte(String(cellule));
}

function titre(cellule: Cellule | undefined): string {
  return normaliserNom(texteCellule(cellule))
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function estVide(ligne: Cellule[]): boolean {
  return ligne.every((cellule) => texteCellule(cellule) === "");
}

function lireTiersTemps(
  cellule: Cellule | undefined,
): { ok: true; valeur: boolean } | { ok: false; brut: string } {
  if (typeof cellule === "boolean") return { ok: true, valeur: cellule };
  const valeur = normaliserNom(texteCellule(cellule));
  if (OUI.has(valeur)) return { ok: true, valeur: true };
  if (NON.has(valeur)) return { ok: true, valeur: false };
  return { ok: false, brut: texteCellule(cellule) };
}

export function analyserTableau(tableau: Cellule[][]): AnalyseTableau {
  const indexTitres = tableau.findIndex((ligne) => !estVide(ligne));
  if (indexTitres === -1) throw erreurs.validation(MESSAGES_IMPORT.aucunEtudiant);
  const titres = (tableau[indexTitres] ?? []).map(titre);
  const colonne = (reconnus: readonly string[]) => titres.findIndex((t) => reconnus.includes(t));
  const colonneNom = colonne(TITRES.nom);
  const colonnePrenom = colonne(TITRES.prenom);
  const colonneTiersTemps = colonne(TITRES.tiersTemps);
  if (colonneNom === -1 || colonnePrenom === -1) throw erreurs.validation(MESSAGES_IMPORT.enTete);

  const donnees = tableau
    .map((ligne, index) => ({ ligne, numero: index + 1 }))
    .slice(indexTitres + 1)
    .filter(({ ligne }) => !estVide(ligne));
  if (donnees.length === 0) throw erreurs.validation(MESSAGES_IMPORT.aucunEtudiant);
  if (donnees.length > MAX_LIGNES_IMPORT) throw erreurs.validation(MESSAGES_IMPORT.tropDeLignes);

  const lignes: LigneImport[] = [];
  const rejets: RejetImport[] = [];
  const premiereLigne = new Map<string, number>();
  for (const { ligne, numero } of donnees) {
    const nom = texteCellule(ligne[colonneNom]);
    const prenom = texteCellule(ligne[colonnePrenom]);
    const motifs = [problemeNomEtudiant(nom, "Le nom"), problemeNomEtudiant(prenom, "Le prénom")].filter(
      (motif): motif is string => motif !== null,
    );
    let tiersTemps: boolean | null = null;
    if (colonneTiersTemps !== -1) {
      const lu = lireTiersTemps(ligne[colonneTiersTemps]);
      if (lu.ok) tiersTemps = lu.valeur;
      else motifs.push(`Tiers-temps non reconnu : « ${lu.brut.slice(0, 30)} » (oui ou non attendu).`);
    }
    if (motifs.length > 0) {
      rejets.push({ numero, motif: motifs.join(" ") });
      continue;
    }
    const cle = cleEtudiant(nom, prenom);
    const dejaVue = premiereLigne.get(cle);
    if (dejaVue !== undefined) {
      rejets.push({ numero, motif: `Même nom et même prénom qu'à la ligne ${dejaVue}.` });
      continue;
    }
    premiereLigne.set(cle, numero);
    lignes.push({ numero, nom, prenom, tiersTemps });
  }
  return { lignes, rejets, colonneTiersTemps: colonneTiersTemps !== -1 };
}
