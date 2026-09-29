import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { sessionExamen } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { MESSAGES_EXAMEN } from "@/lib/regles-examen";
import {
  examenEnCours,
  identifiants,
  passageEnBase,
  poserBrouillon,
  questionDuRang,
  reponsesEnBase,
} from "@/test/examen";
import { INSTANT_CODE_TEST } from "@/test/sessions";
import { rattraperSession } from "./passage";
import { enregistrerBrouillon, validerQuestion } from "./reponses";

const horloge = horlogeFixe(INSTANT_CODE_TEST);

beforeEach(() => {
  horloge.fixer(INSTANT_CODE_TEST);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

/** Question 1 : choix unique Oui/Non ; question 2 : choix multiples A, B justes, C faux. Chrono par question de 30 s. */
const EXAMEN = {
  qcm: { modeChrono: "par_question" as const, dureeGlobaleS: null, dureeQuestionS: 30 },
  questions: [
    {},
    {
      type: "multiple" as const,
      propositions: [
        { texte: "A", correcte: true },
        { texte: "B", correcte: true },
        { texte: "C", correcte: false },
      ],
    },
  ],
};

/** Examen d'un seul étudiant ; renvoie son identifiant de participation et le rang de chaque question. */
async function unEtudiant(options: Parameters<typeof examenEnCours>[1] = EXAMEN) {
  const x = await examenEnCours(horloge, { etudiants: [{ nom: "Dupont", prenom: "Léa" }], ...options });
  const p = x.telephones[0]?.participation.id ?? "";
  const rangUnique = (await questionDuRang(p, 1)).type === "unique" ? 1 : 2;
  return { ...x, p, rangUnique, rangMultiple: 3 - rangUnique };
}

function apres(depart: Date, ms: number): Date {
  return new Date(depart.getTime() + ms);
}

describe("enregistrerBrouillon", () => {
  it("enregistre et remplace la sélection de la question courante, en index d'origine", async () => {
    const x = await unEtudiant();
    const texte = x.rangUnique === 1 ? "Oui" : "A";
    await enregistrerBrouillon(x.p, { rang: 1, selection: await identifiants(x.p, 1, [texte]) });
    const cle = (await questionDuRang(x.p, 1)).cle;
    expect((await reponsesEnBase(x.p)).find((r) => r.questionCle === cle)?.selectionBrouillon).toEqual([0]);
    await enregistrerBrouillon(x.p, { rang: 1, selection: [] });
    expect((await reponsesEnBase(x.p)).find((r) => r.questionCle === cle)).toMatchObject({
      selectionBrouillon: [],
      valideeLe: null,
    });
  });

  it("refuse une sélection mal formée, hors bornes, en double, ou multiple sur un choix unique", async () => {
    const x = await unEtudiant({ ...EXAMEN, questions: [{}, {}] });
    const refus = (selection: string[]) => enregistrerBrouillon(x.p, { rang: 1, selection });
    await expect(refus(["9"])).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(refus(["a"])).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(refus(["5"])).rejects.toMatchObject({ message: MESSAGES_EXAMEN.selectionInvalide });
    await expect(refus(["0", "0"])).rejects.toMatchObject({ message: MESSAGES_EXAMEN.selectionInvalide });
    await expect(refus(["0", "1"])).rejects.toMatchObject({ message: MESSAGES_EXAMEN.uneSeule });
    await expect(enregistrerBrouillon(x.p, { rang: 0, selection: [] })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("refuse une autre question que la courante, avant le départ comme après la fin", async () => {
    const x = await unEtudiant();
    await expect(enregistrerBrouillon(x.p, { rang: 2, selection: [] })).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_EXAMEN.pasOuverte,
    });
    horloge.fixer(x.demarreLe.getTime() - 1);
    await expect(enregistrerBrouillon(x.p, { rang: 1, selection: [] })).rejects.toMatchObject({
      message: MESSAGES_EXAMEN.pasOuverte,
    });
    horloge.fixer(apres(x.demarreLe, 600_000));
    await expect(enregistrerBrouillon(x.p, { rang: 2, selection: [] })).rejects.toMatchObject({
      message: MESSAGES_EXAMEN.pasCourante,
    });
  });

  it("refuse une question échue (tolérance dépassée)", async () => {
    const x = await unEtudiant();
    horloge.fixer(apres(x.demarreLe, 33_001));
    await expect(enregistrerBrouillon(x.p, { rang: 1, selection: [] })).rejects.toMatchObject({
      message: MESSAGES_EXAMEN.pasCourante,
    });
  });
});

describe("validerQuestion", () => {
  it("valide, compte les points et sert la question suivante avec sa propre échéance", async () => {
    const x = await unEtudiant();
    horloge.fixer(apres(x.demarreLe, 12_000));
    const juste = x.rangUnique === 1 ? ["Oui"] : ["A", "B"];
    await validerQuestion(x.p, { rang: 1, selection: await identifiants(x.p, 1, juste) });
    const p = await passageEnBase(x.p);
    expect(p.indexCourant).toBe(1);
    expect(p.questionServieLe?.getTime()).toBe(apres(x.demarreLe, 12_000).getTime());
    expect(p.echeanceQuestionLe?.getTime()).toBe(apres(x.demarreLe, 42_000).getTime());
    const [r] = await reponsesEnBase(x.p);
    expect(r).toMatchObject({ origine: "validation", points: 1 });
  });

  it("tout ou rien sur un choix multiple, puis note et clôture de la session au dernier passage", async () => {
    const x = await unEtudiant();
    await validerQuestion(x.p, {
      rang: 1,
      selection: await identifiants(x.p, 1, x.rangUnique === 1 ? ["Oui"] : ["A"]),
    });
    await validerQuestion(x.p, {
      rang: 2,
      selection: await identifiants(x.p, 2, x.rangUnique === 2 ? ["Oui"] : ["A"]),
    });
    // « A » seul sur le choix multiple : réponse fausse (tout ou rien).
    expect(await passageEnBase(x.p)).toMatchObject({ statut: "terminee", points: 1, noteSur20: 10 });
    const [s] = await db().select().from(sessionExamen).where(eq(sessionExamen.id, x.session.id));
    expect(s?.statut).toBe("terminee");
  });

  it("rejouée pour un rang déjà validé, ne modifie rien (idempotence)", async () => {
    const x = await unEtudiant();
    const texte = x.rangUnique === 1 ? ["Oui"] : ["A", "B"];
    await validerQuestion(x.p, { rang: 1, selection: await identifiants(x.p, 1, texte) });
    const avant = await reponsesEnBase(x.p);
    await validerQuestion(x.p, { rang: 1, selection: [] });
    expect(await reponsesEnBase(x.p)).toEqual(avant);
    expect((await passageEnBase(x.p)).indexCourant).toBe(1);
    await expect(validerQuestion(x.p, { rang: 3, selection: [] })).rejects.toMatchObject({
      code: "ETAT",
      message: MESSAGES_EXAMEN.pasOuverte,
    });
  });

  it("deux validations simultanées de la même question n'en enregistrent qu'une", async () => {
    const x = await unEtudiant();
    const a = await identifiants(x.p, 1, x.rangUnique === 1 ? ["Oui"] : ["A", "B"]);
    await Promise.all([
      validerQuestion(x.p, { rang: 1, selection: a }),
      validerQuestion(x.p, { rang: 1, selection: [] }),
    ]);
    const reponses = await reponsesEnBase(x.p);
    expect(reponses).toHaveLength(1);
    expect(reponses[0]?.origine).toBe("validation");
    expect((await passageEnBase(x.p)).indexCourant).toBe(1);
  });

  it("accepte une validation jusqu'à 3 s après l'échéance, pas au-delà", async () => {
    const x = await unEtudiant();
    horloge.fixer(apres(x.demarreLe, 33_000));
    await validerQuestion(x.p, { rang: 1, selection: [] });
    expect((await reponsesEnBase(x.p))[0]?.origine).toBe("validation");

    const y = await unEtudiant();
    await poserBrouillon(y.p, 1, [y.rangUnique === 1 ? "Oui" : "A"]);
    horloge.fixer(apres(y.demarreLe, 33_001));
    await validerQuestion(y.p, { rang: 1, selection: [] });
    const [r] = await reponsesEnBase(y.p);
    expect(r).toMatchObject({ origine: "echeance", selection: [0] });
  });

  it("validation et rattrapage de l'enseignant au même instant : une seule réponse", async () => {
    const x = await unEtudiant();
    horloge.fixer(apres(x.demarreLe, 33_500));
    await Promise.all([
      validerQuestion(x.p, {
        rang: 1,
        selection: await identifiants(x.p, 1, x.rangUnique === 1 ? ["Oui"] : ["A"]),
      }),
      rattraperSession(x.session.id),
    ]);
    const reponses = await reponsesEnBase(x.p);
    expect(reponses).toHaveLength(1);
    expect(reponses[0]?.origine).toBe("echeance");
    expect((await passageEnBase(x.p)).indexCourant).toBe(1);
  });

  it("en chrono global dépassé mais dans la tolérance : validée, puis l'examen se termine", async () => {
    const x = await unEtudiant({ qcm: { modeChrono: "global", dureeGlobaleS: 60 } });
    horloge.fixer(apres(x.demarreLe, 61_000));
    await validerQuestion(x.p, { rang: 1, selection: await identifiants(x.p, 1, ["Oui"]) });
    const p = await passageEnBase(x.p);
    expect(p).toMatchObject({ statut: "terminee", points: 1, noteSur20: 10 });
    expect((await reponsesEnBase(x.p)).map((r) => r.origine).sort()).toEqual(["fin", "validation"]);
  });
});
