import { describe, expect, it } from "vitest";
import type { QuestionEditee } from "@/modules/qcm";
import {
  brouillonInitial,
  changerType,
  cocher,
  nouvelleProposition,
  problemeSaisieDuree,
  problemeSaisiePoints,
  versSaisie,
  type Brouillon,
} from "./brouillon";

const MOINS = String.fromCharCode(0x2212);
const IMAGE = { id: "3f2b8c1e-0000-4000-8000-000000000001", largeur: 640, hauteur: 480 };

function question(modifications: Partial<QuestionEditee> = {}): QuestionEditee {
  return {
    id: "q1",
    position: 1,
    type: "unique",
    enonce: "Capitale ?",
    image: null,
    code: null,
    propositions: [
      { texte: "Paris", image: null, correcte: true },
      { texte: "Lyon", image: IMAGE, correcte: false },
    ],
    pointsBonne: 1,
    pointsMauvaise: -0.25,
    pointsVide: 0,
    dureeS: null,
    lieeASuivante: false,
    problemes: [],
    ...modifications,
  };
}

let compteur = 0;
const cle = () => {
  compteur += 1;
  return `nouvelle-${compteur}`;
};

describe("brouillonInitial", () => {
  it("met le barème et la durée en texte, au format de l'éditeur", () => {
    const b = brouillonInitial(question({ dureeS: 45 }));
    expect(b.points).toEqual({ bonne: "+1", mauvaise: `${MOINS}0,25`, vide: "0" });
    expect(b.duree).toBe("45");
    expect(b.propositions.map((p) => p.texte)).toEqual(["Paris", "Lyon"]);
  });
});

describe("changerType", () => {
  it("remplace les réponses par Vrai et Faux, puis les rend en revenant au choix unique", () => {
    const initial = brouillonInitial(question());
    const vraiFaux = changerType(initial, "vrai_faux", cle);
    expect(vraiFaux.propositions.map((p) => [p.texte, p.correcte])).toEqual([
      ["Vrai", false],
      ["Faux", false],
    ]);
    const retour = changerType(vraiFaux, "unique", cle);
    expect(retour.propositions).toEqual(initial.propositions);
    expect(retour.avantVraiFaux).toBeNull();
  });

  it("ne garde que la première bonne réponse en quittant le choix multiple", () => {
    const multiple = brouillonInitial(question({ type: "multiple" }));
    const deux = cocher(multiple, multiple.propositions[1]?.cle ?? "", true);
    expect(deux.propositions.map((p) => p.correcte)).toEqual([true, true]);
    expect(changerType(deux, "unique", cle).propositions.map((p) => p.correcte)).toEqual([true, false]);
  });

  it("ne change rien pour le même type", () => {
    const b = brouillonInitial(question());
    expect(changerType(b, "unique", cle)).toBe(b);
  });
});

describe("cocher", () => {
  it("décoche les autres réponses d'un choix unique", () => {
    const b = brouillonInitial(question());
    expect(cocher(b, b.propositions[1]?.cle ?? "", true).propositions.map((p) => p.correcte)).toEqual([
      false,
      true,
    ]);
  });
});

describe("saisie du barème et de la durée", () => {
  it("signale une saisie qui n'est pas un nombre ou qui sort des bornes", () => {
    expect(problemeSaisiePoints("abc", "bonne")).toBe("Nombre attendu, par exemple 1 ou -0,25.");
    expect(problemeSaisiePoints("-1", "bonne")).toBe("Les points d'une bonne réponse vont de 0,01 à 100.");
    expect(problemeSaisiePoints("-0,5", "mauvaise")).toBeNull();
    expect(problemeSaisieDuree("")).toBeNull();
    expect(problemeSaisieDuree("45")).toBeNull();
    expect(problemeSaisieDuree("4")).toBe(
      "La durée par question est un nombre entier de secondes, de 5 à 1800.",
    );
    expect(problemeSaisieDuree("1 min")).toBe(
      "La durée par question est un nombre entier de secondes, de 5 à 1800.",
    );
  });
});

describe("versSaisie", () => {
  it("envoie la question entière, images par identifiant", () => {
    const q = question();
    expect(versSaisie("q1", brouillonInitial(q), q)).toEqual({
      questionId: "q1",
      type: "unique",
      enonce: "Capitale ?",
      imageId: null,
      code: null,
      propositions: [
        { texte: "Paris", imageId: null, correcte: true },
        { texte: "Lyon", imageId: IMAGE.id, correcte: false },
      ],
      pointsBonne: 1,
      pointsMauvaise: -0.25,
      pointsVide: 0,
      dureeS: null,
    });
  });

  it("garde la dernière valeur enregistrée pour un barème ou une durée mal saisis", () => {
    const q = question({ dureeS: 30 });
    const b: Brouillon = {
      ...brouillonInitial(q),
      points: { bonne: "2", mauvaise: "-", vide: "5" },
      duree: "3",
    };
    expect(versSaisie("q1", b, q)).toMatchObject({
      pointsBonne: 2,
      pointsMauvaise: -0.25,
      pointsVide: 0,
      dureeS: 30,
    });
    expect(versSaisie("q1", { ...b, duree: "" }, q).dureeS).toBeNull();
    expect(versSaisie("q1", { ...b, duree: " 60 " }, q).dureeS).toBe(60);
  });

  it("crée une réponse vide avec la clé donnée", () => {
    expect(nouvelleProposition("x")).toEqual({ cle: "x", texte: "", image: null, correcte: false });
  });
});
