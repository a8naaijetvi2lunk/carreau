import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { db } from "@/db";
import { journal, qcm, question } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { MESSAGE_JETON_ABSENT, MESSAGE_JETON_LECTURE, type PorteeMcp } from "@/lib/regles-mcp";
import type { ResultatOutil } from "@/lib/resultats-mcp";
import { MESSAGE_QCM_HORS_MCP, MESSAGE_QUESTION_ILLUSTREE } from "@/modules/qcm";
import { creerClasseTest } from "@/test/classes";
import { creerUtilisateur } from "@/test/comptes";
import { creerImageTest } from "@/test/images";
import { acteurMcpDe, creerJetonMcpTest } from "@/test/mcp";
import { creerQcmTest, creerQuestionTest } from "@/test/qcm";
import { executerOutil, OUTILS, outilParNom, type DefinitionOutil } from "./outils";

const DEBUT = Date.parse("2026-09-30T08:00:00.000Z");
const horloge = horlogeFixe(DEBUT);
const PRET = "Ce QCM est prêt : repasse-le en brouillon pour le modifier.";

beforeEach(() => {
  horloge.fixer(DEBUT);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => {
  definirHorlogePourLesTests();
  vi.restoreAllMocks();
});

/** Enseignant, son jeton réel et l'acteur MCP correspondant : le journal se filtre par l'identifiant du jeton. */
async function assistant(portee: PorteeMcp = "ecriture") {
  const u = await creerUtilisateur();
  const j = await creerJetonMcpTest(u.id, { portee });
  return { u, jetonId: j.id, acteur: acteurMcpDe(u, portee, j.id) };
}

function outil(nom: string): DefinitionOutil {
  const trouve = outilParNom(nom);
  if (!trouve) throw new Error(`Outil ${nom} absent`);
  return trouve;
}

/** Appel d'outil, puis horloge avancée d'une seconde : les entrées du journal restent dans l'ordre. */
async function appeler(acteur: Parameters<typeof executerOutil>[1], nom: string, args: unknown = {}) {
  const resultat = await executerOutil(outil(nom), acteur, args);
  horloge.avancer(1000);
  return resultat;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON d'un résultat d'outil lu librement
function lire(resultat: ResultatOutil): any {
  return JSON.parse(resultat.content[0]?.text ?? "null");
}

async function journalDuJeton(jetonId: string) {
  return db().select().from(journal).where(eq(journal.acteurId, jetonId)).orderBy(asc(journal.creeLe));
}

const CONTENU = {
  type: "unique",
  enonce: "Quel tri est stable ?",
  propositions: [
    { texte: "Tri fusion", correcte: true },
    { texte: "Tri rapide", correcte: false },
  ],
};

describe("liste des outils", () => {
  it("expose exactement les neuf outils du spec §10, dont six d'écriture", () => {
    expect(OUTILS.map((o) => o.nom)).toEqual([
      "classes_lister",
      "qcm_lister",
      "qcm_lire",
      "qcm_creer",
      "question_ajouter",
      "question_modifier",
      "question_supprimer",
      "questions_lier",
      "questions_delier",
    ]);
    expect(OUTILS.filter((o) => o.ecriture).map((o) => o.nom)).toEqual([
      "qcm_creer",
      "question_ajouter",
      "question_modifier",
      "question_supprimer",
      "questions_lier",
      "questions_delier",
    ]);
    expect(outilParNom("sessions_lister")).toBeUndefined();
  });
});

describe("outils de lecture", () => {
  it("classes_lister ne donne que les noms des classes non archivées", async () => {
    const { u, acteur } = await assistant("lecture");
    await creerClasseTest(u.id, { nom: "TD2" });
    await creerClasseTest(u.id, { nom: "Ancienne", archivee: true });
    expect(lire(await appeler(acteur, "classes_lister"))).toEqual({ classes: ["TD2"] });
  });

  it("qcm_lister ne donne que les brouillons, sans leur contenu", async () => {
    const { u, acteur } = await assistant("lecture");
    const brouillon = await creerQcmTest(u.id, { titre: "Tris" });
    await creerQuestionTest(brouillon.id);
    await creerQcmTest(u.id, { titre: "Prêt", statut: "pret" });
    expect(lire(await appeler(acteur, "qcm_lister"))).toEqual({
      qcm: [
        {
          id: brouillon.id,
          titre: "Tris",
          origine: "interface",
          nombreQuestions: 1,
          modifieLe: new Date(DEBUT).toISOString(),
        },
      ],
    });
  });

  it("qcm_lire donne le brouillon entier, les images seulement signalées", async () => {
    const { u, acteur } = await assistant("lecture");
    const q = await creerQcmTest(u.id, { titre: "Tris" });
    const image = await creerImageTest(u.id);
    const q1 = await creerQuestionTest(q.id, {
      enonce: "Quel tri ?",
      imageId: image.id,
      lieeASuivante: true,
    });
    await creerQuestionTest(q.id, { enonce: "", propositions: [] });
    const resultat = await appeler(acteur, "qcm_lire", { qcmId: q.id });
    expect(resultat.content[0]?.text).not.toContain(image.id);
    const lu = lire(resultat);
    expect(lu).toMatchObject({ id: q.id, titre: "Tris", statut: "brouillon", modeChrono: "aucun" });
    expect(lu.questions).toHaveLength(2);
    expect(lu.questions[0]).toEqual({
      id: q1.id,
      numero: 1,
      type: "unique",
      enonce: "Quel tri ?",
      avecImage: true,
      code: null,
      propositions: [
        { texte: "Oui", correcte: true, avecImage: false },
        { texte: "Non", correcte: false, avecImage: false },
      ],
      pointsBonne: 1,
      pointsMauvaise: 0,
      pointsVide: 0,
      dureeS: null,
      lieeASuivante: true,
      problemes: [],
    });
    expect(lu.questions[1].problemes).toContain("L'énoncé est vide.");
    expect(lu.problemes.length).toBeGreaterThan(0);
  });

  it("qcm_lire refuse un QCM prêt ou archivé", async () => {
    const { u, acteur } = await assistant("lecture");
    const q = await creerQcmTest(u.id, { statut: "pret" });
    expect(lire(await appeler(acteur, "qcm_lire", { qcmId: q.id }))).toEqual({
      code: "ETAT",
      message: MESSAGE_QCM_HORS_MCP,
    });
  });
});

describe("portée et validation", () => {
  it("refuse toute écriture à un jeton en lecture seule, avant de lire ses arguments", async () => {
    const { u, acteur, jetonId } = await assistant("lecture");
    const q = await creerQcmTest(u.id);
    for (const nom of OUTILS.filter((o) => o.ecriture).map((o) => o.nom)) {
      const resultat = await appeler(acteur, nom, { intrus: 1, qcmId: q.id, titre: 42 });
      expect(resultat.isError).toBe(true);
      expect(lire(resultat)).toEqual({ code: "ACCES_REFUSE", message: MESSAGE_JETON_LECTURE });
    }
    expect(await db().select().from(qcm).where(eq(qcm.enseignantId, u.id))).toHaveLength(1);
    const entrees = await journalDuJeton(jetonId);
    expect(entrees).toHaveLength(6);
    expect(entrees.every((e) => e.acteurType === "jeton" && e.details.resultat === "ACCES_REFUSE")).toBe(
      true,
    );
  });

  it("valide les arguments en français, chemin compris, et refuse un paramètre inconnu", async () => {
    const { acteur } = await assistant("lecture");
    const manquant = lire(await appeler(acteur, "qcm_lire", {}));
    expect(manquant).toMatchObject({ code: "VALIDATION" });
    expect(manquant.details[0]).toMatch(/^qcmId : /);
    const inconnu = await appeler(acteur, "classes_lister", { intrus: 1 });
    expect(inconnu.content[0]?.text).not.toContain("Input validation error");
    expect(lire(inconnu)).toMatchObject({ code: "VALIDATION" });
  });

  it("répond NON_CONNECTE sans acteur", async () => {
    expect(lire(await executerOutil(outil("qcm_lister"), null, {}))).toEqual({
      code: "NON_CONNECTE",
      message: MESSAGE_JETON_ABSENT,
    });
  });
});

describe("écriture d'un brouillon (livrable du lot 8)", () => {
  it("crée un QCM, écrit ses questions, les lie, puis en supprime une", async () => {
    const { u, acteur } = await assistant();
    const cree = lire(await appeler(acteur, "qcm_creer", { titre: "Tris — Contrôle 1" }));
    expect(cree).toMatchObject({ statut: "brouillon" });
    const [enBase] = await db().select().from(qcm).where(eq(qcm.id, cree.qcmId));
    expect(enBase).toMatchObject({ enseignantId: u.id, statut: "brouillon", origine: "mcp" });

    expect(
      lire(await appeler(acteur, "question_modifier", { questionId: cree.questionId, contenu: CONTENU })),
    ).toEqual({ questionId: cree.questionId, problemes: [] });
    const deuxieme = lire(
      await appeler(acteur, "question_ajouter", {
        qcmId: cree.qcmId,
        contenu: {
          type: "multiple",
          enonce: "Quelles complexités sont en O(n log n) ?",
          code: { langage: "python", source: "sorted(t)" },
          propositions: [
            { texte: "Tri fusion", correcte: true },
            { texte: "Tri par tas", correcte: true },
            { texte: "Tri à bulles", correcte: false },
          ],
          pointsBonne: 2,
          pointsMauvaise: -0.5,
          dureeS: 60,
        },
      }),
    );
    expect(deuxieme.problemes).toEqual([]);
    const troisieme = lire(await appeler(acteur, "question_ajouter", { qcmId: cree.qcmId }));
    expect(troisieme).toMatchObject({
      message: "Question vide ajoutée : remplis-la avec question_modifier.",
    });

    expect(lire(await appeler(acteur, "questions_lier", { questionId: cree.questionId }))).toEqual({
      questionId: cree.questionId,
      lieeASuivante: true,
    });
    let lu = lire(await appeler(acteur, "qcm_lire", { qcmId: cree.qcmId }));
    expect(lu.origine).toBe("mcp");
    expect(
      lu.questions.map((q: { numero: number; lieeASuivante: boolean }) => [q.numero, q.lieeASuivante]),
    ).toEqual([
      [1, true],
      [2, false],
      [3, false],
    ]);
    expect(lu.questions[1]).toMatchObject({
      type: "multiple",
      code: { langage: "python", source: "sorted(t)" },
      pointsBonne: 2,
      pointsMauvaise: -0.5,
      pointsVide: 0,
      dureeS: 60,
    });

    expect(lire(await appeler(acteur, "questions_delier", { questionId: cree.questionId }))).toEqual({
      questionId: cree.questionId,
      lieeASuivante: false,
    });
    expect(lire(await appeler(acteur, "question_supprimer", { questionId: troisieme.questionId }))).toEqual({
      qcmId: cree.qcmId,
    });
    lu = lire(await appeler(acteur, "qcm_lire", { qcmId: cree.qcmId }));
    expect(lu.questions).toHaveLength(2);
    expect(lu.problemes).toEqual([]);
  });

  it("renvoie les problèmes d'une question incomplète et les erreurs de saisie du service", async () => {
    const { acteur } = await assistant();
    const cree = lire(await appeler(acteur, "qcm_creer", { titre: "Brouillon" }));
    const incomplete = lire(
      await appeler(acteur, "question_modifier", {
        questionId: cree.questionId,
        contenu: {
          type: "unique",
          enonce: "Question ?",
          propositions: [{ texte: "Seule", correcte: false }],
        },
      }),
    );
    expect(incomplete.problemes).toEqual(["Il faut au moins 2 réponses.", "Coche la bonne réponse."]);
    const trop = lire(
      await appeler(acteur, "question_modifier", {
        questionId: cree.questionId,
        contenu: { ...CONTENU, enonce: "x".repeat(2001) },
      }),
    );
    expect(trop).toMatchObject({ code: "VALIDATION" });
    expect(trop.details).toEqual(["enonce : L'énoncé dépasse 2000 caractères."]);
  });

  it("n'écrit que sur un brouillon", async () => {
    const { u, acteur } = await assistant();
    const q = await creerQcmTest(u.id, { statut: "pret" });
    const qu = await creerQuestionTest(q.id);
    expect(lire(await appeler(acteur, "question_ajouter", { qcmId: q.id, contenu: CONTENU }))).toEqual({
      code: "ETAT",
      message: PRET,
    });
    expect(
      lire(await appeler(acteur, "question_modifier", { questionId: qu.id, contenu: CONTENU })),
    ).toMatchObject({
      code: "ETAT",
    });
    expect(lire(await appeler(acteur, "questions_lier", { questionId: qu.id }))).toMatchObject({
      code: "ETAT",
    });
    const [intacte] = await db().select().from(question).where(eq(question.id, qu.id));
    expect(intacte?.enonce).toBe("Question 1");
  });

  it("répond « introuvable » pour le QCM ou la question d'un autre enseignant, sans rien changer", async () => {
    const { acteur } = await assistant();
    const autre = await creerUtilisateur();
    const q = await creerQcmTest(autre.id);
    const qu = await creerQuestionTest(q.id);
    for (const [nom, args, message] of [
      ["qcm_lire", { qcmId: q.id }, "QCM introuvable."],
      ["question_ajouter", { qcmId: q.id }, "QCM introuvable."],
      ["question_modifier", { questionId: qu.id, contenu: CONTENU }, "Question introuvable."],
      ["question_supprimer", { questionId: qu.id }, "Question introuvable."],
      ["questions_lier", { questionId: qu.id }, "Question introuvable."],
      ["questions_delier", { questionId: qu.id }, "Question introuvable."],
    ] as const) {
      expect(lire(await appeler(acteur, nom, args))).toEqual({ code: "INTROUVABLE", message });
    }
    const questions = await db().select().from(question).where(eq(question.qcmId, q.id));
    expect(questions.map((x) => x.enonce)).toEqual(["Question 1"]);
  });

  it("refuse de modifier une question illustrée", async () => {
    const { u, acteur } = await assistant();
    const q = await creerQcmTest(u.id);
    const image = await creerImageTest(u.id);
    const qu = await creerQuestionTest(q.id, { imageId: image.id });
    expect(lire(await appeler(acteur, "question_modifier", { questionId: qu.id, contenu: CONTENU }))).toEqual(
      {
        code: "ETAT",
        message: MESSAGE_QUESTION_ILLUSTREE,
      },
    );
  });
});

describe("journal des appels (décision D9 du plan du lot 8)", () => {
  it("journalise chaque appel au nom du jeton, sans ses arguments", async () => {
    const { acteur, jetonId } = await assistant();
    const cree = lire(await appeler(acteur, "qcm_creer", { titre: "Titre secret 42" }));
    await appeler(acteur, "question_modifier", {
      questionId: cree.questionId,
      contenu: { ...CONTENU, enonce: "Énoncé secret 42" },
    });
    await appeler(acteur, "qcm_lire", { qcmId: "pas-un-uuid" });
    const entrees = await journalDuJeton(jetonId);
    expect(entrees.map((e) => [e.acteurType, e.action, e.cible, e.details])).toEqual([
      ["jeton", "mcp.qcm_creer", `qcm:${cree.qcmId}`, { resultat: "ok" }],
      ["jeton", "mcp.question_modifier", `question:${cree.questionId}`, { resultat: "ok" }],
      ["jeton", "mcp.qcm_lire", null, { resultat: "INTROUVABLE" }],
    ]);
    const tout = JSON.stringify(await db().select().from(journal));
    expect(tout).not.toContain("secret 42");
    expect(tout).not.toContain("pas-un-uuid");
  });

  it("répond par une référence à une erreur inattendue, sans rien divulguer", async () => {
    const { acteur, jetonId } = await assistant("lecture");
    const erreurConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const enPanne: DefinitionOutil = {
      nom: "essai_panne",
      titre: "Panne",
      description: "Outil de test.",
      schema: z.strictObject({}),
      ecriture: false,
      executer: async () => {
        throw new Error("Failed query: select * from qcm\nparams: secret");
      },
    };
    const resultat = lire(await executerOutil(enPanne, acteur, {}));
    expect(resultat.code).toBe("INTERNE");
    expect(resultat.message).toMatch(/^Une erreur inattendue est survenue \(réf\. [0-9A-F]{8}\)\.$/);
    expect(JSON.stringify(resultat)).not.toContain("secret");
    expect(erreurConsole).toHaveBeenCalledTimes(1);
    const [entree] = await journalDuJeton(jetonId);
    expect(entree).toMatchObject({ action: "mcp.essai_panne", details: { resultat: "INTERNE" } });
    expect(resultat.message).toContain(String((entree?.details as { reference: string }).reference));
  });
});
