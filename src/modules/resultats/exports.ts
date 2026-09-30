/**
 * Exports des résultats (spec §9.1 ; décision D8 du plan du lot 7) : CSV pour Excel en français et
 * classeur XLSX (une feuille de synthèse, une feuille par question). Mêmes lignes que le tableau,
 * par nom. Texte neutralisé dans le CSV ; dans le XLSX, texte typé String, jamais une formule.
 */
import "server-only";
import { and, inArray, isNotNull } from "drizzle-orm";
import writeXlsxFile, { type Cell, type Row, type Sheet } from "write-excel-file/node";
import { z } from "zod";
import { db } from "@/db";
import { reponse } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { octetsCsv } from "@/lib/csv";
import { erreurs } from "@/lib/erreurs";
import type { ContenuSession, QuestionInstantanee } from "@/lib/instantane";
import {
  celluleSynthese,
  comparerNoms,
  EN_TETES_QUESTION,
  EN_TETES_SYNTHESE,
  lettre,
  nomFichierExport,
  resultatQuestion,
} from "@/lib/regles-resultats";
import { lireIdentifiant, valider } from "@/lib/validation";
import type { LigneResultat, VueResultats } from "@/lib/vue-resultats";
import { journaliser, journaliserLesRefus } from "@/modules/journal";
import { estTerminee, racineDeLActeur, rattraperFamille } from "./commun";
import { construireResultats } from "./resultats";

export type FichierExport = { nom: string; contenu: Uint8Array };

export const MESSAGE_RESULTATS_INDISPONIBLES = "Les résultats seront disponibles à la fin de l'examen.";

const schemaSession = z.strictObject({ sessionId: z.string() });

type ReponseExportee = { selection: number[]; points: number };

type DonneesExport = {
  vue: VueResultats;
  contenu: ContenuSession;
  /** Réponses validées de chaque participation présente, par clé de question. */
  reponses: Map<string, Map<string, ReponseExportee>>;
  lignes: LigneResultat[];
};

async function donneesExport(
  acteur: ActeurUtilisateur,
  saisie: { sessionId: string },
  format: "csv" | "xlsx",
): Promise<DonneesExport> {
  const sessionId = lireIdentifiant(valider(schemaSession, saisie, "Session").sessionId, "Session");
  const racine = await racineDeLActeur(db(), acteur, sessionId);
  if (!estTerminee(racine)) throw erreurs.etat(MESSAGE_RESULTATS_INDISPONIBLES);
  await rattraperFamille(racine.id);
  const vue = await construireResultats(db(), racine);
  const presents = vue.lignes.flatMap((l) =>
    l.statut === "present" && l.participationId !== null ? [l.participationId] : [],
  );
  const reponses = new Map<string, Map<string, ReponseExportee>>(presents.map((id) => [id, new Map()]));
  if (presents.length > 0) {
    const lignes = await db()
      .select({
        participationId: reponse.participationId,
        cle: reponse.questionCle,
        selection: reponse.selection,
        points: reponse.points,
      })
      .from(reponse)
      .where(and(inArray(reponse.participationId, presents), isNotNull(reponse.valideeLe)));
    for (const l of lignes) {
      reponses.get(l.participationId)?.set(l.cle, { selection: l.selection ?? [], points: l.points ?? 0 });
    }
  }
  await journaliser({
    acteur: { type: "utilisateur", id: acteur.id },
    action: "resultats.exporter",
    cible: `session:${racine.id}`,
    details: { format },
  });
  return { vue, contenu: racine.contenu, reponses, lignes: [...vue.lignes].sort(comparerNoms) };
}

/** CSV (D8) : BOM, « ; », CRLF, une ligne par étudiant par nom. */
export async function exporterResultatsCsv(
  acteur: ActeurUtilisateur,
  saisie: { sessionId: string },
): Promise<FichierExport> {
  return journaliserLesRefus(acteur, "resultats.exporter", async () => {
    const { vue, lignes } = await donneesExport(acteur, saisie, "csv");
    return {
      nom: nomFichierExport(vue.titre, new Date(vue.demarreLe), "csv"),
      contenu: octetsCsv([[...EN_TETES_SYNTHESE], ...lignes.map(celluleSynthese)]),
    };
  });
}

function texte(valeur: string | null, gras = false): Cell {
  if (valeur === null) return null;
  return gras ? { value: valeur, type: String, fontWeight: "bold" } : { value: valeur, type: String };
}

function nombre(valeur: number | null): Cell {
  return valeur === null ? null : { value: valeur, type: Number };
}

function cellule(valeur: string | number | null): Cell {
  return typeof valeur === "number" ? nombre(valeur) : texte(valeur);
}

function enTete(titres: readonly string[]): Row {
  return titres.map((t) => texte(t, true));
}

function feuilleQuestion(
  question: QuestionInstantanee,
  numero: number,
  lignes: LigneResultat[],
  reponses: DonneesExport["reponses"],
): Sheet<Buffer> {
  const data: Row[] = [
    [texte(`Question ${numero}`, true)],
    [texte("Énoncé", true), texte(question.enonce), null],
    ...question.propositions.map((p, index): Row => [
      texte(lettre(index), true),
      texte(p.texte === "" ? "(image)" : p.texte),
      texte(p.correcte ? "Bonne réponse" : null),
    ]),
    [texte("Points d’une bonne réponse", true), nombre(question.pointsBonne), null],
    [texte("Points d’une mauvaise réponse", true), nombre(question.pointsMauvaise), null],
    [texte("Points sans réponse", true), nombre(question.pointsVide), null],
    [],
    enTete(EN_TETES_QUESTION),
  ];
  for (const l of lignes) {
    if (l.statut !== "present" || l.participationId === null) continue;
    const r = reponses.get(l.participationId)?.get(question.cle);
    const selection = r?.selection ?? [];
    data.push([
      texte(l.nom),
      texte(l.prenom),
      texte(
        selection.length === 0
          ? null
          : [...selection]
              .sort((a, b) => a - b)
              .map(lettre)
              .join(", "),
      ),
      texte(resultatQuestion(selection, question)),
      nombre(r?.points ?? null),
    ]);
  }
  return {
    sheet: `Q${numero}`,
    data,
    columns: [{ width: 22 }, { width: 40 }, { width: 16 }, { width: 14 }, { width: 10 }],
  };
}

/** Classeur XLSX (D8) : « Synthèse », puis « Q1 », « Q2 »… dans l'ordre du QCM. */
export async function exporterResultatsXlsx(
  acteur: ActeurUtilisateur,
  saisie: { sessionId: string },
): Promise<FichierExport> {
  return journaliserLesRefus(acteur, "resultats.exporter", async () => {
    const { vue, contenu, reponses, lignes } = await donneesExport(acteur, saisie, "xlsx");
    const synthese: Sheet<Buffer> = {
      sheet: "Synthèse",
      data: [enTete(EN_TETES_SYNTHESE), ...lignes.map((l) => celluleSynthese(l).map(cellule))],
      columns: [
        { width: 20 },
        { width: 16 },
        { width: 12 },
        { width: 12 },
        { width: 10 },
        { width: 12 },
        { width: 8 },
        { width: 16 },
        { width: 10 },
        { width: 20 },
      ],
      stickyRowsCount: 1,
    };
    const feuilles = contenu.questions.map((q, index) => feuilleQuestion(q, index + 1, lignes, reponses));
    const tampon = await writeXlsxFile([synthese, ...feuilles]).toBuffer();
    return {
      nom: nomFichierExport(vue.titre, new Date(vue.demarreLe), "xlsx"),
      contenu: new Uint8Array(tampon),
    };
  });
}
