import { describe, expect, it } from "vitest";
import {
  CLES_LANGAGES,
  decouperEnBlocs,
  estLangageCode,
  LANGAGES_CODE,
  MESSAGE_DUREE_GLOBALE,
  MESSAGE_DUREE_QUESTION,
  problemeDureeGlobaleMinutes,
  problemeDureeQuestionS,
  problemesQcm,
  problemesQuestion,
  type QuestionRegle,
} from "./regles-qcm";

const IMAGE_A = "3f2b8c1e-0000-4000-8000-000000000001";
const IMAGE_B = "3f2b8c1e-0000-4000-8000-000000000002";

function question(modifications: Partial<QuestionRegle> = {}): QuestionRegle {
  return {
    type: "unique",
    enonce: "Quelle est la capitale de la France ?",
    code: null,
    propositions: [
      { texte: "Paris", imageId: null, correcte: true },
      { texte: "Lyon", imageId: null, correcte: false },
    ],
    ...modifications,
  };
}

describe("problemesQuestion", () => {
  it("ne signale rien pour une question complète", () => {
    expect(problemesQuestion(question())).toEqual([]);
  });

  it("signale un énoncé vide ou blanc", () => {
    expect(problemesQuestion(question({ enonce: "  \n " }))).toEqual(["L'énoncé est vide."]);
  });

  it("signale un bloc de code vide et accepte un bloc rempli", () => {
    expect(problemesQuestion(question({ code: { langage: "python", source: " \n" } }))).toEqual([
      "Le bloc de code est vide : écris le code ou retire le bloc.",
    ]);
    expect(problemesQuestion(question({ code: { langage: "python", source: "print(1)" } }))).toEqual([]);
  });

  it("exige au moins 2 réponses", () => {
    expect(
      problemesQuestion(question({ propositions: [{ texte: "Paris", imageId: null, correcte: true }] })),
    ).toEqual(["Il faut au moins 2 réponses."]);
  });

  it("exige exactement 2 réponses pour un vrai/faux", () => {
    const propositions = [
      { texte: "Vrai", imageId: null, correcte: true },
      { texte: "Faux", imageId: null, correcte: false },
      { texte: "Peut-être", imageId: null, correcte: false },
    ];
    expect(problemesQuestion(question({ type: "vrai_faux", propositions }))).toEqual([
      "Un vrai/faux a exactement 2 réponses.",
    ]);
  });

  it("signale une réponse sans texte ni image, mais accepte une réponse en image seule", () => {
    const propositions = [
      { texte: "Paris", imageId: null, correcte: true },
      { texte: "  ", imageId: null, correcte: false },
      { texte: "", imageId: IMAGE_A, correcte: false },
    ];
    expect(problemesQuestion(question({ propositions }))).toEqual(["La réponse 2 est vide."]);
  });

  it("signale deux réponses au texte identique, sans tenir compte de la casse ni des espaces", () => {
    const propositions = [
      { texte: "Paris", imageId: null, correcte: true },
      { texte: "  paris ", imageId: null, correcte: false },
    ];
    expect(problemesQuestion(question({ propositions }))).toEqual(["Les réponses 1 et 2 sont identiques."]);
  });

  it("ne compare pas les textes des réponses illustrées", () => {
    const propositions = [
      { texte: "Courbe", imageId: IMAGE_A, correcte: true },
      { texte: "Courbe", imageId: IMAGE_B, correcte: false },
    ];
    expect(problemesQuestion(question({ propositions }))).toEqual([]);
  });

  it("exige la bonne réponse d'un choix unique", () => {
    const propositions = [
      { texte: "Paris", imageId: null, correcte: false },
      { texte: "Lyon", imageId: null, correcte: false },
    ];
    expect(problemesQuestion(question({ propositions }))).toEqual(["Coche la bonne réponse."]);
  });

  it.each(["unique", "vrai_faux"] as const)("refuse plusieurs bonnes réponses pour le type %s", (type) => {
    const propositions = [
      { texte: "Vrai", imageId: null, correcte: true },
      { texte: "Faux", imageId: null, correcte: true },
    ];
    expect(problemesQuestion(question({ type, propositions }))).toEqual([
      "Une seule bonne réponse est possible pour ce type de question.",
    ]);
  });

  it("exige au moins une bonne réponse pour un choix multiple et en accepte plusieurs", () => {
    const aucune = [
      { texte: "2", imageId: null, correcte: false },
      { texte: "3", imageId: null, correcte: false },
    ];
    const deux = aucune.map((p) => ({ ...p, correcte: true }));
    expect(problemesQuestion(question({ type: "multiple", propositions: aucune }))).toEqual([
      "Coche au moins une bonne réponse.",
    ]);
    expect(problemesQuestion(question({ type: "multiple", propositions: deux }))).toEqual([]);
  });

  it("cumule les problèmes dans l'ordre", () => {
    const propositions = [
      { texte: "Paris", imageId: null, correcte: false },
      { texte: "Lyon", imageId: null, correcte: false },
    ];
    expect(problemesQuestion(question({ enonce: "", propositions }))).toEqual([
      "L'énoncé est vide.",
      "Coche la bonne réponse.",
    ]);
  });
});

describe("problemesQcm", () => {
  it("exige au moins une question", () => {
    expect(
      problemesQcm({ modeChrono: "aucun", dureeGlobaleS: null, dureeQuestionS: null, questions: [] }),
    ).toEqual(["Ajoute au moins une question."]);
  });

  it("exige la durée de l'examen en chrono global", () => {
    expect(
      problemesQcm({
        modeChrono: "global",
        dureeGlobaleS: null,
        dureeQuestionS: 30,
        questions: [question()],
      }),
    ).toEqual(["Indique la durée de l'examen (onglet Paramètres)."]);
  });

  it("exige la durée par question en chrono par question", () => {
    expect(
      problemesQcm({
        modeChrono: "par_question",
        dureeGlobaleS: 1200,
        dureeQuestionS: null,
        questions: [question()],
      }),
    ).toEqual(["Indique la durée par question (onglet Paramètres)."]);
  });

  it("préfixe les problèmes de chaque question par son numéro", () => {
    expect(
      problemesQcm({
        modeChrono: "aucun",
        dureeGlobaleS: null,
        dureeQuestionS: null,
        questions: [question(), question({ enonce: "" })],
      }),
    ).toEqual(["Question 2 : L'énoncé est vide."]);
  });

  it("accepte un QCM de 20 questions complètes avec sa durée", () => {
    const questions = Array.from({ length: 20 }, (_, i) => question({ enonce: `Question ${i + 1}` }));
    expect(
      problemesQcm({ modeChrono: "global", dureeGlobaleS: 1200, dureeQuestionS: null, questions }),
    ).toEqual([]);
  });
});

describe("decouperEnBlocs", () => {
  const q = (id: string, lieeASuivante = false) => ({ id, lieeASuivante });

  it("fait un bloc par question sans liaison", () => {
    expect(decouperEnBlocs([q("a"), q("b"), q("c")]).map((b) => b.map((x) => x.id))).toEqual([
      ["a"],
      ["b"],
      ["c"],
    ]);
  });

  it("garde une chaîne de questions liées dans un même bloc, dans l'ordre", () => {
    expect(
      decouperEnBlocs([q("a", true), q("b", true), q("c"), q("d")]).map((b) => b.map((x) => x.id)),
    ).toEqual([["a", "b", "c"], ["d"]]);
  });

  it("ferme le dernier bloc même si la dernière question est marquée liée", () => {
    expect(decouperEnBlocs([q("a"), q("b", true)]).map((b) => b.map((x) => x.id))).toEqual([["a"], ["b"]]);
  });

  it("renvoie une liste vide sans question", () => {
    expect(decouperEnBlocs([])).toEqual([]);
  });
});

describe("durées", () => {
  it.each([1, 20, 300])("accepte %i minutes d'examen", (minutes) => {
    expect(problemeDureeGlobaleMinutes(minutes)).toBeNull();
  });

  it.each([0, 301, 1.5, Number.NaN])("refuse %s minutes d'examen", (minutes) => {
    expect(problemeDureeGlobaleMinutes(minutes)).toBe(MESSAGE_DUREE_GLOBALE);
  });

  it.each([5, 45, 1800])("accepte %i secondes par question", (secondes) => {
    expect(problemeDureeQuestionS(secondes)).toBeNull();
  });

  it.each([4, 1801, 2.5, Number.NaN])("refuse %s secondes par question", (secondes) => {
    expect(problemeDureeQuestionS(secondes)).toBe(MESSAGE_DUREE_QUESTION);
  });

  it("donne les bornes dans les messages", () => {
    expect(MESSAGE_DUREE_GLOBALE).toBe("La durée de l'examen est un nombre entier de minutes, de 1 à 300.");
    expect(MESSAGE_DUREE_QUESTION).toBe(
      "La durée par question est un nombre entier de secondes, de 5 à 1800.",
    );
  });
});

describe("langages du code", () => {
  it("liste les 14 langages de la liste blanche", () => {
    expect(CLES_LANGAGES).toHaveLength(14);
    expect(LANGAGES_CODE.cpp).toBe("C++");
    expect(LANGAGES_CODE.texte).toBe("Texte brut");
  });

  it("reconnaît une clé de langage, jamais une propriété héritée", () => {
    expect(estLangageCode("python")).toBe(true);
    expect(estLangageCode("ruby")).toBe(false);
    expect(estLangageCode("toString")).toBe(false);
  });
});
