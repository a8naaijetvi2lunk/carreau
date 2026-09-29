/**
 * Import d'une liste d'étudiants (spec §9.1 ; décisions D11 à D15 du plan du lot 2). L'aperçu lit
 * la source, l'analyse et la compare à la classe sans rien écrire. L'import reçoit les lignes que
 * l'enseignant a vues, les revalide entièrement et les enregistre en transaction, classe
 * verrouillée : le fichier n'est jamais renvoyé.
 */
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, type Executeur } from "@/db";
import { etudiant } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { erreurs } from "@/lib/erreurs";
import { maintenant } from "@/lib/horloge";
import { cleEtudiant, normaliserNom } from "@/lib/noms";
import { journaliser, journaliserLesRefus } from "@/modules/journal";
import {
  classeDeLActeur,
  lireIdentifiant,
  MAX_ETUDIANTS_PAR_CLASSE,
  schemaNomEtudiant,
  valider,
} from "../commun";
import { analyserTableau, type LigneImport, type RejetImport } from "./analyse";
import { lireSource, type SourceImport } from "./lecture";
import { MAX_LIGNES_IMPORT } from "./messages";

export type StatutLigneImport = "nouveau" | "tiers_temps_modifie" | "deja_present";
export type LigneApercu = LigneImport & { statut: StatutLigneImport };
export type ApercuImport = {
  lignes: LigneApercu[];
  rejets: RejetImport[];
  colonneTiersTemps: boolean;
  ajouts: number;
  misesAJour: number;
  dejaPresents: number;
};
export type BilanImport = { ajoutes: number; misAJour: number; inchanges: number };

const MESSAGE_LISTE_INVALIDE = "La liste à importer est invalide : relance l'aperçu.";

const schemaSource = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("fichier"), nom: z.string().max(255), octets: z.instanceof(Uint8Array) }),
  z.strictObject({ type: z.literal("texte"), texte: z.string() }),
]);
const schemaAnalyse = z.strictObject({ classeId: z.string(), source: schemaSource });
const schemaImport = z.strictObject({
  classeId: z.string(),
  lignes: z
    .array(
      z.strictObject({
        nom: schemaNomEtudiant("Le nom"),
        prenom: schemaNomEtudiant("Le prénom"),
        tiersTemps: z.boolean().nullable(),
      }),
      { error: MESSAGE_LISTE_INVALIDE },
    )
    .min(1, { error: "Aucun étudiant à importer." })
    .max(MAX_LIGNES_IMPORT, { error: `La liste dépasse ${MAX_LIGNES_IMPORT} lignes.` }),
});

type Existant = { id: string; tiersTemps: boolean };

/** Étudiants de la classe par clé d'homonymie (noms normalisés). */
async function existantsParCle(executeur: Executeur, classeId: string): Promise<Map<string, Existant>> {
  const lignes = await executeur
    .select({
      id: etudiant.id,
      nomNormalise: etudiant.nomNormalise,
      prenomNormalise: etudiant.prenomNormalise,
      tiersTemps: etudiant.tiersTemps,
    })
    .from(etudiant)
    .where(eq(etudiant.classeId, classeId));
  return new Map(
    lignes.map((l) => [`${l.nomNormalise}|${l.prenomNormalise}`, { id: l.id, tiersTemps: l.tiersTemps }]),
  );
}

/** Sans colonne Tiers-temps (`null`), un étudiant déjà présent ne change pas (décision D12). */
function statutDe(tiersTemps: boolean | null, existant: Existant | undefined): StatutLigneImport {
  if (!existant) return "nouveau";
  return tiersTemps !== null && tiersTemps !== existant.tiersTemps ? "tiers_temps_modifie" : "deja_present";
}

function verifierCapacite(effectif: number, ajouts: number): void {
  if (effectif + ajouts > MAX_ETUDIANTS_PAR_CLASSE) {
    throw erreurs.etat(
      `La classe dépasserait ${MAX_ETUDIANTS_PAR_CLASSE} étudiants (${effectif} aujourd'hui, ${ajouts} à ajouter).`,
    );
  }
}

/** Aperçu de l'import : rien n'est écrit. La classe est contrôlée avant toute lecture de la source. */
export async function analyserImport(
  acteur: ActeurUtilisateur,
  saisie: { classeId: string; source: SourceImport },
): Promise<ApercuImport> {
  return journaliserLesRefus(acteur, "classes.analyser_import", async () => {
    const donnees = valider(schemaAnalyse, saisie, "Import");
    const classeId = lireIdentifiant(donnees.classeId, "Classe");
    await classeDeLActeur(db(), acteur, classeId);
    const analyse = analyserTableau(await lireSource(donnees.source));
    const existants = await existantsParCle(db(), classeId);
    const lignes = analyse.lignes.map((ligne) => ({
      ...ligne,
      statut: statutDe(ligne.tiersTemps, existants.get(cleEtudiant(ligne.nom, ligne.prenom))),
    }));
    const ajouts = lignes.filter((l) => l.statut === "nouveau").length;
    verifierCapacite(existants.size, ajouts);
    return {
      lignes,
      rejets: analyse.rejets,
      colonneTiersTemps: analyse.colonneTiersTemps,
      ajouts,
      misesAJour: lignes.filter((l) => l.statut === "tiers_temps_modifie").length,
      dejaPresents: lignes.filter((l) => l.statut === "deja_present").length,
    };
  });
}

/**
 * Enregistre les lignes confirmées : nouveaux étudiants créés, tiers-temps mis à jour, étudiants
 * absents de la liste conservés. Les statuts sont recalculés sous verrou (la classe a pu changer
 * depuis l'aperçu) ; une ligne répétée ne compte qu'une fois.
 */
export async function importerEtudiants(
  acteur: ActeurUtilisateur,
  saisie: { classeId: string; lignes: unknown },
): Promise<BilanImport> {
  return journaliserLesRefus(acteur, "classes.importer", async () => {
    const donnees = valider(schemaImport, saisie, "Import");
    const classeId = lireIdentifiant(donnees.classeId, "Classe");
    return db().transaction(async (tx) => {
      await classeDeLActeur(tx, acteur, classeId, true);
      const existants = await existantsParCle(tx, classeId);
      const vues = new Set<string>();
      const aCreer: { nom: string; prenom: string; tiersTemps: boolean }[] = [];
      const passerAOui: string[] = [];
      const passerANon: string[] = [];
      let inchanges = 0;
      for (const ligne of donnees.lignes) {
        const cle = cleEtudiant(ligne.nom, ligne.prenom);
        if (vues.has(cle)) {
          inchanges += 1;
          continue;
        }
        vues.add(cle);
        const existant = existants.get(cle);
        const statut = statutDe(ligne.tiersTemps, existant);
        if (statut === "nouveau")
          aCreer.push({ nom: ligne.nom, prenom: ligne.prenom, tiersTemps: ligne.tiersTemps ?? false });
        else if (statut === "tiers_temps_modifie" && existant)
          (ligne.tiersTemps ? passerAOui : passerANon).push(existant.id);
        else inchanges += 1;
      }
      verifierCapacite(existants.size, aCreer.length);
      if (aCreer.length > 0) {
        const instant = maintenant();
        await tx.insert(etudiant).values(
          aCreer.map((l) => ({
            classeId,
            nom: l.nom,
            prenom: l.prenom,
            nomNormalise: normaliserNom(l.nom),
            prenomNormalise: normaliserNom(l.prenom),
            tiersTemps: l.tiersTemps,
            creeLe: instant,
          })),
        );
      }
      for (const [ids, tiersTemps] of [
        [passerAOui, true],
        [passerANon, false],
      ] as const) {
        if (ids.length > 0) {
          await tx
            .update(etudiant)
            .set({ tiersTemps })
            .where(and(eq(etudiant.classeId, classeId), inArray(etudiant.id, ids)));
        }
      }
      const bilan = { ajoutes: aCreer.length, misAJour: passerAOui.length + passerANon.length, inchanges };
      await journaliser(
        {
          acteur: { type: "utilisateur", id: acteur.id },
          action: "classes.importer",
          cible: `classe:${classeId}`,
          details: bilan,
        },
        tx,
      );
      return bilan;
    });
  });
}
