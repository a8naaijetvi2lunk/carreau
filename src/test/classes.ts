/** Données de test des classes, pour les tests d'intégration (base isolée). */
import ecrireClasseur from "write-excel-file/node";
import { db } from "@/db";
import { classe, etudiant } from "@/db/schema";
import { maintenant } from "@/lib/horloge";
import { normaliserNom } from "@/lib/noms";
import { exiger } from "./comptes";

let compteur = 0;

export async function creerClasseTest(
  enseignantId: string,
  options: { nom?: string; archivee?: boolean } = {},
) {
  compteur += 1;
  const [creee] = await db()
    .insert(classe)
    .values({
      enseignantId,
      nom: options.nom ?? `Classe ${compteur}`,
      archivee: options.archivee ?? false,
      creeLe: maintenant(),
    })
    .returning();
  return exiger(creee, "classe");
}

export async function creerEtudiantTest(
  classeId: string,
  options: { nom?: string; prenom?: string; tiersTemps?: boolean } = {},
) {
  compteur += 1;
  const nom = options.nom ?? `Nom${compteur}`;
  const prenom = options.prenom ?? "Prénom";
  const [cree] = await db()
    .insert(etudiant)
    .values({
      classeId,
      nom,
      prenom,
      nomNormalise: normaliserNom(nom),
      prenomNormalise: normaliserNom(prenom),
      tiersTemps: options.tiersTemps ?? false,
      creeLe: maintenant(),
    })
    .returning();
  return exiger(cree, "étudiant");
}

/** Classeur XLSX d'une feuille, écrit par write-excel-file comme l'enregistrerait un tableur. */
export async function classeurXlsx(lignes: (string | number | boolean | null)[][]): Promise<Uint8Array> {
  const tampon = await ecrireClasseur(
    lignes.map((ligne) => ligne.map((valeur) => (valeur === null ? null : { value: valeur }))),
  ).toBuffer();
  return new Uint8Array(tampon);
}
