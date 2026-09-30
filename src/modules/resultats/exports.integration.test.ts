import { unzipSync } from "fflate";
import readXlsxFile from "read-excel-file/node";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { etudiant, journal } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { validerQuestion } from "@/modules/examen";
import { acteurDe, creerUtilisateur } from "@/test/comptes";
import { examenEnCours, examenTermine, identifiants } from "@/test/examen";
import { INSTANT_CODE_TEST } from "@/test/sessions";
import { exporterResultatsCsv, exporterResultatsXlsx, MESSAGE_RESULTATS_INDISPONIBLES } from "./exports";

const horloge = horlogeFixe(INSTANT_CODE_TEST);

beforeEach(() => {
  horloge.fixer(INSTANT_CODE_TEST);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

/** Léa : deux bonnes réponses ; Sacha : une mauvaise (−0,25) ; Hugo : rien. */
async function repondre(x: Awaited<ReturnType<typeof examenEnCours>>): Promise<void> {
  const [lea, sacha] = x.telephones.map((t) => t.participation.id);
  if (!lea || !sacha) throw new Error("participations absentes");
  await validerQuestion(lea, { rang: 1, selection: await identifiants(lea, 1, ["Oui"]) });
  await validerQuestion(lea, { rang: 2, selection: await identifiants(lea, 2, ["Oui"]) });
  await validerQuestion(sacha, { rang: 1, selection: await identifiants(sacha, 1, ["Non"]) });
}

/** Examen terminé ; le nom de Tom Bernard (absent) commence une formule de tableur. */
async function examenAExporter() {
  const x = await examenTermine(horloge, { pendant: repondre });
  const [, tom] = x.absents;
  await db().update(etudiant).set({ nom: '=HYPERLINK("http://x";"y")' }).where(eq(etudiant.id, tom.id));
  return x;
}

describe("exporterResultatsCsv (D8)", () => {
  it("écrit un CSV pour Excel : BOM, « ; », une ligne par étudiant par nom, formules neutralisées", async () => {
    const x = await examenAExporter();
    const fichier = await exporterResultatsCsv(x.acteur, { sessionId: x.session.id });
    const date = x.demarreLe.toISOString().slice(0, 10);
    expect(fichier.nom).toBe(`resultats-algorithmique-controle-2-${date}.csv`);
    expect([...fichier.contenu.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lignes = new TextDecoder().decode(fichier.contenu.slice(3)).split("\r\n");
    expect(lignes[0]).toBe(
      "Nom;Prénom;Tiers-temps;Passage;Statut;Note sur 20;Points;Bonnes réponses;Durée (s);Indice de suspicion",
    );
    // Tri par « NOM Prénom » en français : un symbole (« = ») passe avant les lettres.
    expect(lignes[1]).toBe('"\'=HYPERLINK(""http://x"";""y"")";Tom;Non;;Absent;;;;;');
    expect(lignes[2]).toMatch(/^Dupont;Léa;Non;Session;Présent;20;2;2;30;\d+$/);
    expect(lignes[3]).toMatch(/^Dupré;Sacha;Non;Session;Présent;0;0;0;60;\d+$/);
    expect(lignes[4]).toMatch(/^Dupuis;Hugo;Non;Session;Présent;0;0;0;60;\d+$/);
    expect(lignes[5]).toBe("Martin;Inès;Non;;Absent;;;;;");
    expect(lignes[6]).toBe("");
    expect(lignes).toHaveLength(7);
    const [trace] = await db()
      .select()
      .from(journal)
      .where(and(eq(journal.action, "resultats.exporter"), eq(journal.cible, `session:${x.session.id}`)));
    expect(trace).toMatchObject({ cible: `session:${x.session.id}`, details: { format: "csv" } });
  });

  it("refuse avant la fin de l'examen, et la session d'un autre compte comme une inconnue", async () => {
    const enCours = await examenEnCours(horloge);
    await expect(
      exporterResultatsCsv(enCours.acteur, { sessionId: enCours.session.id }),
    ).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGE_RESULTATS_INDISPONIBLES,
    });
    const x = await examenTermine(horloge);
    const autre = acteurDe(await creerUtilisateur());
    await expect(exporterResultatsXlsx(autre, { sessionId: x.session.id })).rejects.toMatchObject({
      code: "INTROUVABLE",
      message: "Session introuvable.",
    });
  });
});

describe("exporterResultatsXlsx (D8)", () => {
  it("écrit une feuille de synthèse et une feuille par question, texte jamais en formule", async () => {
    const x = await examenAExporter();
    const fichier = await exporterResultatsXlsx(x.acteur, { sessionId: x.session.id });
    expect(fichier.nom).toMatch(/^resultats-algorithmique-controle-2-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const feuilles = await readXlsxFile(Buffer.from(fichier.contenu));
    expect(feuilles.map((f) => f.sheet)).toEqual(["Synthèse", "Q1", "Q2"]);

    const synthese = feuilles[0]?.data ?? [];
    expect(synthese[0]).toEqual([
      "Nom",
      "Prénom",
      "Tiers-temps",
      "Passage",
      "Statut",
      "Note sur 20",
      "Points",
      "Bonnes réponses",
      "Durée (s)",
      "Indice de suspicion",
    ]);
    // Le texte reste du texte : le nom de Tom est relu tel quel, sans apostrophe ni évaluation.
    expect(synthese.slice(1).map((l) => l.slice(0, 8))).toEqual([
      ['=HYPERLINK("http://x";"y")', "Tom", "Non", null, "Absent", null, null, null],
      ["Dupont", "Léa", "Non", "Session", "Présent", 20, 2, 2],
      ["Dupré", "Sacha", "Non", "Session", "Présent", 0, 0, 0],
      ["Dupuis", "Hugo", "Non", "Session", "Présent", 0, 0, 0],
      ["Martin", "Inès", "Non", null, "Absent", null, null, null],
    ]);

    // Les lignes relues sont complétées par des cellules vides jusqu'à la dernière colonne de la feuille.
    const q1 = feuilles[1]?.data ?? [];
    const premieres = (debut: string, n: number) => q1.find((l) => l[0] === debut)?.slice(0, n);
    expect(q1[0]?.[0]).toBe("Question 1");
    expect(premieres("Énoncé", 2)).toEqual(["Énoncé", "Question 1"]);
    expect(premieres("A", 3)).toEqual(["A", "Oui", "Bonne réponse"]);
    expect(premieres("B", 3)).toEqual(["B", "Non", null]);
    expect(premieres("Points d’une mauvaise réponse", 2)).toEqual(["Points d’une mauvaise réponse", -0.25]);
    const entete = q1.findIndex((l) => l[0] === "Nom" && l[2] === "Réponse");
    expect(entete).toBeGreaterThan(0);
    const lignesQ1 = q1.slice(entete + 1).map((l) => l.slice(0, 5));
    expect(lignesQ1).toHaveLength(3);
    expect(lignesQ1[0]).toEqual(["Dupont", "Léa", "A", "Juste", 1]);
    // Sacha a répondu « Non » à sa première question, qui est Q1 ou Q2 selon son ordre.
    expect(lignesQ1[1]?.slice(0, 2)).toEqual(["Dupré", "Sacha"]);
    expect([
      ["B", "Faux", -0.25],
      [null, "Sans réponse", 0],
    ]).toContainEqual(lignesQ1[1]?.slice(2, 5));
    expect(lignesQ1[2]).toEqual(["Dupuis", "Hugo", null, "Sans réponse", 0]);

    // Aucune formule dans les feuilles : le texte est une chaîne partagée.
    const archive = unzipSync(fichier.contenu);
    const feuillesXml = Object.keys(archive).filter((nom) => nom.startsWith("xl/worksheets/sheet"));
    expect(feuillesXml).toHaveLength(3);
    for (const nom of feuillesXml) {
      expect(new TextDecoder().decode(archive[nom])).not.toContain("<f>");
    }
  });
});
