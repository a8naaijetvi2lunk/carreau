import { describe, expect, it } from "vitest";
import {
  appliquer,
  apresValidation,
  echeanceQuestion,
  echue,
  etatDeDepart,
  expiration,
  finPrevue,
  terminer,
  type ChronoPassage,
  type EtatPassage,
} from "./echeances";

const T0 = new Date(1_790_000_000_000);

function a(secondes: number): Date {
  return new Date(T0.getTime() + secondes * 1000);
}

const GLOBAL: ChronoPassage = {
  modeChrono: "global",
  dureeGlobaleS: 1200,
  dureesS: [null, null, null],
  tiersTemps: false,
};
const PAR_QUESTION: ChronoPassage = {
  modeChrono: "par_question",
  dureeGlobaleS: null,
  dureesS: [10, 20, 30],
  tiersTemps: false,
};
const SANS: ChronoPassage = {
  modeChrono: "aucun",
  dureeGlobaleS: null,
  dureesS: [null, null, null],
  tiersTemps: false,
};

describe("échéances d'une question et du départ", () => {
  it("n'a d'échéance de question qu'en chrono par question", () => {
    expect(echeanceQuestion(GLOBAL, 0, T0)).toBeNull();
    expect(echeanceQuestion(SANS, 0, T0)).toBeNull();
    expect(echeanceQuestion(PAR_QUESTION, 1, T0)).toEqual(a(20));
  });

  it("allonge chaque durée d'un tiers, à la seconde supérieure, en tiers-temps", () => {
    expect(echeanceQuestion({ ...PAR_QUESTION, tiersTemps: true }, 0, T0)).toEqual(a(14));
    expect(etatDeDepart({ ...GLOBAL, tiersTemps: true }, T0).echeanceGlobaleLe).toEqual(a(1600));
  });

  it("refuse une question sans durée en chrono par question", () => {
    expect(() => echeanceQuestion({ ...PAR_QUESTION, dureesS: [null] }, 0, T0)).toThrow("Durée absente");
    expect(() => echeanceQuestion(PAR_QUESTION, 5, T0)).toThrow("Durée absente");
  });

  it("sert la première question au départ, avec ses échéances", () => {
    expect(etatDeDepart(GLOBAL, T0)).toEqual({
      indexCourant: 0,
      questionServieLe: T0,
      echeanceQuestionLe: null,
      echeanceGlobaleLe: a(1200),
      termineeLe: null,
    });
    expect(etatDeDepart(PAR_QUESTION, T0)).toMatchObject({
      echeanceQuestionLe: a(10),
      echeanceGlobaleLe: null,
    });
    expect(etatDeDepart(SANS, T0)).toMatchObject({ echeanceQuestionLe: null, echeanceGlobaleLe: null });
  });

  it("refuse un chrono global sans durée", () => {
    expect(() => etatDeDepart({ ...GLOBAL, dureeGlobaleS: null }, T0)).toThrow("Durée globale absente");
  });
});

describe("fin prévue d'une session", () => {
  it("ajoute la durée globale, allongée si un participant a un tiers-temps", () => {
    expect(finPrevue("global", 1200, [], false, T0)).toEqual(a(1200));
    expect(finPrevue("global", 1200, [], true, T0)).toEqual(a(1600));
  });

  it("additionne les durées des questions, chacune allongée en tiers-temps", () => {
    expect(finPrevue("par_question", null, [10, 20], false, T0)).toEqual(a(30));
    expect(finPrevue("par_question", null, [10, 20], true, T0)).toEqual(a(14 + 27));
  });

  it("n'en a pas sans chrono, et refuse une durée absente", () => {
    expect(finPrevue("aucun", null, [], true, T0)).toBeNull();
    expect(() => finPrevue("global", null, [], false, T0)).toThrow("Durée globale absente");
    expect(() => finPrevue("par_question", null, [10, null], false, T0)).toThrow("Durée absente");
  });
});

describe("expiration avec tolérance", () => {
  it("rend une échéance effective 3 s après sa valeur", () => {
    expect(expiration(T0)).toEqual(a(3));
    expect(echue(T0, a(3))).toBe(false);
    expect(echue(T0, new Date(a(3).getTime() + 1))).toBe(true);
    expect(echue(null, a(9999))).toBe(false);
  });
});

describe("après une validation", () => {
  const depart = etatDeDepart(PAR_QUESTION, T0);

  it("sert la question suivante aussitôt, avec sa propre échéance", () => {
    expect(apresValidation(depart, PAR_QUESTION, 3, a(4))).toEqual({
      etat: { ...depart, indexCourant: 1, questionServieLe: a(4), echeanceQuestionLe: a(24) },
      clotures: [],
    });
  });

  it("termine l'examen après la dernière question", () => {
    const derniere: EtatPassage = { ...depart, indexCourant: 2 };
    expect(apresValidation(derniere, PAR_QUESTION, 3, a(50))).toEqual({
      etat: { ...derniere, indexCourant: 3, echeanceQuestionLe: null, termineeLe: a(50) },
      clotures: [],
    });
  });

  it("ne sert plus de question une fois l'échéance globale dépassée (tolérance)", () => {
    const global = etatDeDepart(GLOBAL, T0);
    const resultat = apresValidation(global, GLOBAL, 3, a(1202));
    expect(resultat.etat).toMatchObject({ indexCourant: 3, termineeLe: a(1202) });
    expect(resultat.clotures).toEqual([
      { index: 1, origine: "fin", le: a(1202) },
      { index: 2, origine: "fin", le: a(1202) },
    ]);
  });
});

describe("terminer", () => {
  it("valide la question courante à l'échéance et laisse les suivantes sans réponse", () => {
    const etat: EtatPassage = { ...etatDeDepart(GLOBAL, T0), indexCourant: 1 };
    expect(terminer(etat, 3, a(100))).toEqual({
      etat: { ...etat, indexCourant: 3, echeanceQuestionLe: null, termineeLe: a(100) },
      clotures: [
        { index: 1, origine: "echeance", le: a(100) },
        { index: 2, origine: "fin", le: a(100) },
      ],
    });
  });

  it("ne change rien à un examen déjà terminé", () => {
    const fini: EtatPassage = { ...etatDeDepart(GLOBAL, T0), indexCourant: 3, termineeLe: a(5) };
    expect(terminer(fini, 3, a(100))).toEqual({ etat: fini, clotures: [] });
  });
});

describe("rattrapage des échéances", () => {
  it("ne change rien avant l'expiration, tolérance comprise", () => {
    const depart = etatDeDepart(PAR_QUESTION, T0);
    expect(appliquer(depart, PAR_QUESTION, 3, a(13))).toEqual({ etat: depart, clotures: [] });
    expect(appliquer(etatDeDepart(SANS, T0), SANS, 3, a(99_999)).clotures).toEqual([]);
  });

  it("enchaîne les questions échues d'un téléphone éteint, sans recaler sur son retour", () => {
    // Q1 échue à 10 s, expirée à 13 s ; Q2 servie à 13 s, échue à 33 s, expirée à 36 s ; Q3 servie à 36 s.
    const resultat = appliquer(etatDeDepart(PAR_QUESTION, T0), PAR_QUESTION, 3, a(40));
    expect(resultat.clotures).toEqual([
      { index: 0, origine: "echeance", le: a(13) },
      { index: 1, origine: "echeance", le: a(36) },
    ]);
    expect(resultat.etat).toEqual({
      indexCourant: 2,
      questionServieLe: a(36),
      echeanceQuestionLe: a(66),
      echeanceGlobaleLe: null,
      termineeLe: null,
    });
  });

  it("termine l'examen après l'expiration de la dernière question", () => {
    const resultat = appliquer(etatDeDepart(PAR_QUESTION, T0), PAR_QUESTION, 3, a(500));
    expect(resultat.clotures.map((c) => c.index)).toEqual([0, 1, 2]);
    expect(resultat.etat).toMatchObject({ indexCourant: 3, termineeLe: a(69), echeanceQuestionLe: null });
  });

  it("termine l'examen à l'expiration de l'échéance globale", () => {
    const etat: EtatPassage = { ...etatDeDepart(GLOBAL, T0), indexCourant: 1 };
    const resultat = appliquer(etat, GLOBAL, 3, a(1300));
    expect(resultat.clotures).toEqual([
      { index: 1, origine: "echeance", le: a(1203) },
      { index: 2, origine: "fin", le: a(1203) },
    ]);
    expect(resultat.etat).toMatchObject({ indexCourant: 3, termineeLe: a(1203) });
  });

  it("traite d'abord l'échéance qui expire la première", () => {
    const mixte: ChronoPassage = { ...PAR_QUESTION, dureeGlobaleS: 15 };
    // Question expirée à 13 s, examen à 18 s : Q1 close, Q2 servie à 13 s puis l'examen se termine.
    const etat: EtatPassage = { ...etatDeDepart(PAR_QUESTION, T0), echeanceGlobaleLe: a(15) };
    const resultat = appliquer(etat, mixte, 3, a(60));
    expect(resultat.clotures).toEqual([
      { index: 0, origine: "echeance", le: a(13) },
      { index: 1, origine: "echeance", le: a(18) },
      { index: 2, origine: "fin", le: a(18) },
    ]);
    expect(resultat.etat).toMatchObject({ indexCourant: 3, termineeLe: a(18) });
  });

  it("ne touche pas un examen terminé", () => {
    const fini: EtatPassage = { ...etatDeDepart(GLOBAL, T0), indexCourant: 3, termineeLe: a(5) };
    expect(appliquer(fini, GLOBAL, 3, a(99_999))).toEqual({ etat: fini, clotures: [] });
  });
});
