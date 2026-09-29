"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executerAction, type ResultatAction } from "@/lib/action";
import { lireCase, lireChamp, lireChampJson, lireFichier } from "@/lib/formulaire";
import { exigerActeur } from "@/modules/auth";
import {
  ajouterEtudiant,
  analyserImport,
  archiverClasse,
  changerTiersTemps,
  creerClasse,
  importerEtudiants,
  modifierEtudiant,
  renommerClasse,
  restaurerClasse,
  retirerEtudiant,
  type ApercuImport,
  type BilanImport,
  type SourceImport,
} from "@/modules/classes";
import type { ResultatMessage } from "./types";

/** Liste des classes et page de chaque classe : l'effectif affiché change avec presque chaque action. */
function rafraichir(): void {
  revalidatePath("/enseignant/classes");
  revalidatePath("/enseignant/classes/[classeId]", "page");
}

async function avecMessage(action: () => Promise<string>): Promise<ResultatAction<ResultatMessage>> {
  const resultat = await executerAction(async () => ({ message: await action() }));
  if (resultat.ok) rafraichir();
  return resultat;
}

/** Crée la classe puis ouvre sa page. */
export async function creerClasseAction(
  _etat: ResultatAction<null> | null,
  formulaire: FormData,
): Promise<ResultatAction<null>> {
  const resultat = await executerAction(async () =>
    creerClasse(await exigerActeur(), { nom: lireChamp(formulaire, "nom") }),
  );
  if (!resultat.ok) return resultat;
  rafraichir();
  redirect(`/enseignant/classes/${resultat.donnees.id}`);
}

export async function renommerClasseAction(
  _etat: ResultatAction<ResultatMessage> | null,
  formulaire: FormData,
): Promise<ResultatAction<ResultatMessage>> {
  return avecMessage(async () => {
    await renommerClasse(await exigerActeur(), {
      classeId: lireChamp(formulaire, "classeId"),
      nom: lireChamp(formulaire, "nom"),
    });
    return "Classe renommée.";
  });
}

export async function archiverClasseAction(
  _etat: ResultatAction<ResultatMessage> | null,
  formulaire: FormData,
): Promise<ResultatAction<ResultatMessage>> {
  return avecMessage(async () => {
    await archiverClasse(await exigerActeur(), { classeId: lireChamp(formulaire, "classeId") });
    return "Classe archivée.";
  });
}

export async function restaurerClasseAction(
  _etat: ResultatAction<ResultatMessage> | null,
  formulaire: FormData,
): Promise<ResultatAction<ResultatMessage>> {
  return avecMessage(async () => {
    await restaurerClasse(await exigerActeur(), { classeId: lireChamp(formulaire, "classeId") });
    return "Classe restaurée.";
  });
}

export async function ajouterEtudiantAction(
  _etat: ResultatAction<ResultatMessage> | null,
  formulaire: FormData,
): Promise<ResultatAction<ResultatMessage>> {
  return avecMessage(async () => {
    const ajoute = await ajouterEtudiant(await exigerActeur(), {
      classeId: lireChamp(formulaire, "classeId"),
      nom: lireChamp(formulaire, "nom"),
      prenom: lireChamp(formulaire, "prenom"),
      tiersTemps: lireCase(formulaire, "tiersTemps"),
    });
    return `${ajoute.prenom} ${ajoute.nom} est dans la classe.`;
  });
}

export async function modifierEtudiantAction(
  _etat: ResultatAction<ResultatMessage> | null,
  formulaire: FormData,
): Promise<ResultatAction<ResultatMessage>> {
  return avecMessage(async () => {
    const modifie = await modifierEtudiant(await exigerActeur(), {
      etudiantId: lireChamp(formulaire, "etudiantId"),
      nom: lireChamp(formulaire, "nom"),
      prenom: lireChamp(formulaire, "prenom"),
    });
    return `${modifie.prenom} ${modifie.nom} : modification enregistrée.`;
  });
}

export async function changerTiersTempsAction(
  _etat: ResultatAction<ResultatMessage> | null,
  formulaire: FormData,
): Promise<ResultatAction<ResultatMessage>> {
  return avecMessage(async () => {
    const e = await changerTiersTemps(await exigerActeur(), {
      etudiantId: lireChamp(formulaire, "etudiantId"),
      tiersTemps: lireChamp(formulaire, "tiersTemps") === "true",
    });
    return e.tiersTemps
      ? `Tiers-temps activé pour ${e.prenom} ${e.nom}.`
      : `Tiers-temps retiré pour ${e.prenom} ${e.nom}.`;
  });
}

export async function retirerEtudiantAction(
  _etat: ResultatAction<ResultatMessage> | null,
  formulaire: FormData,
): Promise<ResultatAction<ResultatMessage>> {
  return avecMessage(async () => {
    const e = await retirerEtudiant(await exigerActeur(), {
      etudiantId: lireChamp(formulaire, "etudiantId"),
    });
    return `${e.prenom} ${e.nom} ne fait plus partie de la classe.`;
  });
}

/** Aperçu d'un import : fichier choisi ou texte collé, selon le champ `source` (décision D13). */
export async function analyserImportAction(formulaire: FormData): Promise<ResultatAction<ApercuImport>> {
  return executerAction(async () => {
    const acteur = await exigerActeur();
    const fichier = lireFichier(formulaire, "fichier");
    const source: SourceImport =
      lireChamp(formulaire, "source") === "texte"
        ? { type: "texte", texte: lireChamp(formulaire, "texte") }
        : {
            type: "fichier",
            nom: fichier?.name ?? "",
            octets: fichier ? new Uint8Array(await fichier.arrayBuffer()) : new Uint8Array(),
          };
    return analyserImport(acteur, { classeId: lireChamp(formulaire, "classeId"), source });
  });
}

/** Import des lignes confirmées, renvoyées en JSON par le formulaire de l'aperçu (décision D13). */
export async function importerEtudiantsAction(formulaire: FormData): Promise<ResultatAction<BilanImport>> {
  const resultat = await executerAction(async () =>
    importerEtudiants(await exigerActeur(), {
      classeId: lireChamp(formulaire, "classeId"),
      lignes: lireChampJson(formulaire, "lignes"),
    }),
  );
  if (resultat.ok) rafraichir();
  return resultat;
}
