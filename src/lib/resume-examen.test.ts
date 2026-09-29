import { describe, expect, it } from "vitest";
import { resumerExamen, VARIABLE, type QcmAResumer } from "./resume-examen";

/** Signe moins typographique de `formaterPoints` (U+2212). */
const MOINS = String.fromCharCode(0x2212);

function question(valeurs: Partial<QcmAResumer["questions"][number]> = {}): QcmAResumer["questions"][number] {
  return { pointsBonne: 1, pointsMauvaise: -0.25, pointsVide: 0, dureeS: null, ...valeurs };
}

describe("resumerExamen", () => {
  it("chrono global : durée et barème commun, sans tiers-temps", () => {
    expect(
      resumerExamen(
        {
          modeChrono: "global",
          dureeGlobaleS: 1200,
          dureeQuestionS: null,
          questions: [question(), question()],
        },
        false,
      ),
    ).toEqual({
      questions: 2,
      duree: "20 min",
      dureeTiersTemps: null,
      bareme: `+1 juste · ${MOINS}0,25 faux`,
    });
  });

  it("chrono global avec tiers-temps : durée × 4/3", () => {
    expect(
      resumerExamen(
        { modeChrono: "global", dureeGlobaleS: 1200, dureeQuestionS: null, questions: [question()] },
        true,
      ).dureeTiersTemps,
    ).toBe("26 min 40 s");
  });

  it("chrono par question : durée commune, surcharges égales comprises", () => {
    const resume = resumerExamen(
      {
        modeChrono: "par_question",
        dureeGlobaleS: null,
        dureeQuestionS: 30,
        questions: [question(), question({ dureeS: 30 })],
      },
      true,
    );
    expect(resume.duree).toBe("30 s par question");
    expect(resume.dureeTiersTemps).toBe("40 s par question");
  });

  it("chrono par question : durées différentes", () => {
    const resume = resumerExamen(
      {
        modeChrono: "par_question",
        dureeGlobaleS: null,
        dureeQuestionS: 30,
        questions: [question(), question({ dureeS: 60 })],
      },
      true,
    );
    expect(resume.duree).toBe(VARIABLE);
    expect(resume.dureeTiersTemps).toBe("Chaque durée allongée d’un tiers");
  });

  it("sans chrono : aucune limite, même en tiers-temps", () => {
    expect(
      resumerExamen(
        { modeChrono: "aucun", dureeGlobaleS: null, dureeQuestionS: null, questions: [question()] },
        true,
      ),
    ).toMatchObject({ duree: "Sans limite de temps", dureeTiersTemps: null });
  });

  it("barème différent selon les questions, ou points sans réponse", () => {
    expect(
      resumerExamen(
        {
          modeChrono: "aucun",
          dureeGlobaleS: null,
          dureeQuestionS: null,
          questions: [question(), question({ pointsBonne: 2 })],
        },
        false,
      ).bareme,
    ).toBe(VARIABLE);
    expect(
      resumerExamen(
        {
          modeChrono: "aucun",
          dureeGlobaleS: null,
          dureeQuestionS: null,
          questions: [question({ pointsVide: -0.5 })],
        },
        false,
      ).bareme,
    ).toBe(`+1 juste · ${MOINS}0,25 faux · ${MOINS}0,5 sans réponse`);
  });
});
