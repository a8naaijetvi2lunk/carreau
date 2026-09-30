import { describe, expect, it } from "vitest";
import { PONDERATION_V1 } from "@/lib/regles-surveillance";
import { calculerIndice, consolider, faitsNotables, type EvenementBrut } from "./indice";

const T = 1_790_000_000_000;
const FIN = new Date(T + 600_000);

function a(secondes: number): Date {
  return new Date(T + secondes * 1000);
}

/** Événement reçu à T + `secondes` ; ceux du téléphone portent le chargement « c1 » par défaut. */
function e(type: string, secondes: number, extra: Partial<EvenementBrut> = {}): EvenementBrut {
  const serveur = type === "silence" || type === "second_appareil";
  return {
    type,
    recuLe: a(secondes),
    dureeMs: null,
    questionIndex: 2,
    chargement: serveur ? null : "c1",
    sequence: null,
    ...extra,
  };
}

function indice(evenements: EvenementBrut[], validations: Date[] = []) {
  return calculerIndice(consolider(evenements, FIN), validations);
}

describe("les cinq scénarios de référence (décision D6)", () => {
  it("page masquée 8 s puis retour : sortie de 8 s, 8 points", () => {
    const c = consolider([e("masquee", 2), e("visible", 10)], FIN);
    expect(c.sorties).toEqual([{ debut: a(2), fin: a(10), dureeMs: 8_000, questionIndex: 2 }]);
    expect(calculerIndice(c, [])).toEqual({
      valeur: 8,
      version: 1,
      detail: [{ signal: "sortie", nombre: 1, points: 8 }],
    });
  });

  it("masquée perdue, retour 40 s après : le silence expliqué compte comme une sortie de 40 s", () => {
    const c = consolider(
      [
        e("silence", 40, { dureeMs: 40_000 }),
        e("masquee", 40, { sequence: 1 }),
        e("visible", 40, { sequence: 2 }),
      ],
      FIN,
    );
    expect(c.sorties).toEqual([{ debut: a(0), fin: a(40), dureeMs: 40_000, questionIndex: 2 }]);
    expect(calculerIndice(c, []).valeur).toBe(40);
  });

  it("réseau coupé 30 s : coupure listée, 0 point", () => {
    const c = consolider(
      [
        e("silence", 30, { dureeMs: 30_000 }),
        e("hors_ligne", 30, { sequence: 1 }),
        e("en_ligne", 30, { sequence: 2 }),
      ],
      FIN,
    );
    expect(c.sorties).toEqual([]);
    expect(c.coupures).toEqual([{ debut: a(0), fin: a(30), dureeMs: 30_000, questionIndex: 2 }]);
    expect(calculerIndice(c, [])).toEqual({
      valeur: 0,
      version: 1,
      detail: [{ signal: "coupure", nombre: 1, points: 0 }],
    });
  });

  it("téléphone éteint jusqu'à la fin : silence inexpliqué, sortie plafonnée à 45 points", () => {
    expect(indice([e("silence", 60, { dureeMs: 60_000 })])).toEqual({
      valeur: 45,
      version: 1,
      detail: [{ signal: "sortie", nombre: 1, points: 45 }],
    });
  });

  it("perte de focus 3 s sans sortie : 6 points", () => {
    expect(indice([e("focus_perdu", 1), e("focus_revenu", 4)])).toEqual({
      valeur: 6,
      version: 1,
      detail: [{ signal: "focus", nombre: 1, points: 6 }],
    });
  });
});

describe("consolidation (décision D4)", () => {
  it("garde la première masquée ouverte (pagehide puis visibilitychange sur iOS)", () => {
    const c = consolider([e("masquee", 2), e("masquee", 3), e("visible", 10)], FIN);
    expect(c.sorties.map((s) => s.dureeMs)).toEqual([8_000]);
  });

  it("ignore un retour sans départ et ferme à la fin une sortie restée ouverte", () => {
    const c = consolider([e("visible", 1), e("masquee", 590)], FIN);
    expect(c.sorties).toEqual([{ debut: a(590), fin: FIN, dureeMs: 10_000, questionIndex: 2 }]);
  });

  it("trie par numéro les événements reçus au même instant", () => {
    const c = consolider([e("visible", 5, { sequence: 2 }), e("masquee", 5, { sequence: 1 })], FIN);
    expect(c.sorties).toEqual([]);
  });

  it("ignore un silence qui recouvre une sortie de page déjà comptée", () => {
    const c = consolider([e("masquee", 2), e("silence", 42, { dureeMs: 40_000 }), e("visible", 42)], FIN);
    expect(c.sorties).toEqual([{ debut: a(2), fin: a(42), dureeMs: 40_000, questionIndex: 2 }]);
  });

  it("explique un silence par des événements reçus jusqu'à 10 s après sa fin, pas au-delà", () => {
    // hors_ligne et en_ligne reçus ensemble : leur paire (0 s) est ignorée, seul le silence compte.
    const dansLaFenetre = consolider(
      [
        e("silence", 30, { dureeMs: 30_000 }),
        e("hors_ligne", 40, { sequence: 1 }),
        e("en_ligne", 40, { sequence: 2 }),
      ],
      FIN,
    );
    expect(dansLaFenetre.coupures).toHaveLength(1);
    const horsFenetre = consolider(
      [
        e("silence", 30, { dureeMs: 30_000 }),
        e("hors_ligne", 41, { sequence: 1 }),
        e("en_ligne", 41, { sequence: 2 }),
      ],
      FIN,
    );
    expect(horsFenetre.coupures).toEqual([]);
    expect(horsFenetre.sorties.map((s) => s.dureeMs)).toEqual([30_000]);
  });

  it("préfère la sortie à la coupure quand la page a été masquée", () => {
    const c = consolider(
      [
        e("silence", 30, { dureeMs: 30_000 }),
        e("hors_ligne", 30, { sequence: 1 }),
        e("masquee", 30, { sequence: 2 }),
        e("visible", 30, { sequence: 3 }),
        e("en_ligne", 30, { sequence: 4 }),
      ],
      FIN,
    );
    expect(c.sorties).toHaveLength(1);
    expect(c.coupures).toEqual([]);
  });

  it("ignore un silence sans durée", () => {
    expect(consolider([e("silence", 30)], FIN).sorties).toEqual([]);
  });

  it("écarte la perte de focus qui accompagne une sortie", () => {
    const c = consolider(
      [e("focus_perdu", 1), e("masquee", 2), e("visible", 10), e("focus_revenu", 11)],
      FIN,
    );
    expect(c.focus).toEqual([]);
    expect(c.sorties).toHaveLength(1);
  });

  it("relève presse-papiers, écran partagé, second appareil et rechargements", () => {
    const c = consolider(
      [
        e("debut", 0),
        e("copie", 5),
        e("coupe", 6),
        e("colle", 7),
        e("ecran_partage", 8),
        e("second_appareil", 9),
        e("debut", 100, { chargement: "c2" }),
        e("masquee", 120, { chargement: "c2" }),
        e("debut", 200, { chargement: "c3" }),
      ],
      FIN,
    );
    expect(c.pressePapiers.map((p) => p.le)).toEqual([a(5), a(6), a(7)]);
    expect(c.ecranPartage).toEqual([{ le: a(8), questionIndex: 2 }]);
    expect(c.secondAppareil).toEqual([{ le: a(9), questionIndex: 2 }]);
    expect(c.rechargements.map((r) => r.le)).toEqual([a(100), a(200)]);
  });
});

describe("indice v1 (décision D5)", () => {
  it("donne au moins 5 points à une sortie courte", () => {
    expect(indice([e("masquee", 2), e("visible", 4)]).valeur).toBe(5);
  });

  it("ne compte une perte de focus qu'à partir de 2 s", () => {
    expect(indice([e("focus_perdu", 1), e("focus_revenu", 2.5)]).detail).toEqual([]);
  });

  it("ajoute 12 points pour une réponse validée moins de 10 s après une sortie d'au moins 5 s", () => {
    const sortie = [e("masquee", 2), e("visible", 10)];
    // D4-bis, règle 4 : la validation compte dès l'instant du retour (avant : strictement après), donc
    // une validation à l'instant même de la sortie compte désormais la réponse rapide (8 + 12 = 20,
    // au lieu de 8 avant le correctif).
    expect(indice(sortie, [a(10)]).valeur).toBe(20);
    expect(indice(sortie, [a(15)]).detail).toEqual([
      { signal: "sortie", nombre: 1, points: 8 },
      { signal: "reponse_rapide", nombre: 1, points: 12 },
    ]);
    expect(indice(sortie, [a(20)]).valeur).toBe(20);
    expect(indice(sortie, [a(20.5)]).valeur).toBe(8);
    expect(indice([e("masquee", 2), e("visible", 5)], [a(6)]).valeur).toBe(5);
  });

  it("compte chaque signal ponctuel et range le détail dans l'ordre du spec", () => {
    const resultat = indice([
      e("debut", 0),
      e("ecran_partage", 3),
      e("second_appareil", 4),
      e("copie", 5),
      e("debut", 50, { chargement: "c2" }),
    ]);
    expect(resultat.detail).toEqual([
      { signal: "presse_papiers", nombre: 1, points: 10 },
      { signal: "second_appareil", nombre: 1, points: 20 },
      { signal: "ecran_partage", nombre: 1, points: 5 },
      { signal: "rechargement", nombre: 1, points: 0 },
    ]);
    expect(resultat.valeur).toBe(35);
  });

  it("borne le total à 100", () => {
    const evenements = Array.from({ length: 12 }, (_, i) => e("copie", i));
    expect(indice(evenements).valeur).toBe(100);
  });

  it("applique une autre pondération et en garde la version", () => {
    const c = consolider([e("copie", 1)], FIN);
    expect(calculerIndice(c, [], { ...PONDERATION_V1, version: 2, pressePapiers: 3 })).toEqual({
      valeur: 3,
      version: 2,
      detail: [{ signal: "presse_papiers", nombre: 1, points: 3 }],
    });
  });
});

describe("faits notables", () => {
  it("liste sorties, focus d'au moins 2 s, coupures et ponctuels dans l'ordre du temps", () => {
    const c = consolider(
      [
        e("masquee", 2),
        e("visible", 10),
        e("focus_perdu", 20),
        e("focus_revenu", 21),
        e("focus_perdu", 30),
        e("focus_revenu", 34),
        e("copie", 40),
        e("silence", 70, { dureeMs: 20_000 }),
        e("hors_ligne", 70, { sequence: 1 }),
        e("en_ligne", 70, { sequence: 2 }),
        e("ecran_partage", 80),
        e("second_appareil", 90),
        e("silence", 150, { dureeMs: 20_000 }),
      ],
      FIN,
    );
    expect(faitsNotables(c).map((f) => [f.type, f.le.getTime() - T, f.dureeMs])).toEqual([
      ["sortie", 10_000, 8_000],
      ["focus", 34_000, 4_000],
      ["presse_papiers", 40_000, null],
      ["coupure", 70_000, 20_000],
      ["ecran_partage", 80_000, null],
      ["second_appareil", 90_000, null],
      ["sortie", 150_000, 20_000],
    ]);
  });

  it("inclut les rechargements", () => {
    const c = consolider([e("debut", 0), e("debut", 50, { chargement: "c2" })], FIN);
    expect(faitsNotables(c)).toEqual([{ type: "rechargement", le: a(50), dureeMs: null, questionIndex: 2 }]);
  });
});

describe("correctif D4-bis (retour constaté, silences déjà comptés, réponse rapide)", () => {
  const FIN_1200 = new Date(T + 1_200_000);

  it("un rechargement referme une sortie restée ouverte", () => {
    const c = consolider(
      [
        e("debut", 0, { sequence: 1 }),
        e("masquee", 100, { sequence: 2 }),
        e("debut", 105, { chargement: "c2", sequence: 1 }),
      ],
      FIN_1200,
    );
    expect(c.sorties).toEqual([{ debut: a(100), fin: a(105), dureeMs: 5_000, questionIndex: 2 }]);
    const resultat = calculerIndice(c, []);
    expect(resultat.valeur).toBe(5);
    expect(resultat.detail).toEqual([
      { signal: "sortie", nombre: 1, points: 5 },
      { signal: "rechargement", nombre: 1, points: 0 },
    ]);
  });

  it("un rechargement referme une perte de focus restée ouverte", () => {
    const c = consolider(
      [
        e("debut", 0, { sequence: 1 }),
        e("focus_perdu", 10, { sequence: 2 }),
        e("debut", 13, { chargement: "c2", sequence: 1 }),
      ],
      FIN_1200,
    );
    expect(c.focus).toEqual([{ debut: a(10), fin: a(13), dureeMs: 3_000, questionIndex: 2 }]);
    expect(calculerIndice(c, []).valeur).toBe(6);
  });

  it("un silence referme une sortie restée ouverte, sans absorber les silences suivants", () => {
    const c = consolider(
      [
        e("masquee", 5, { sequence: 1 }),
        e("silence", 100, { dureeMs: 40_000 }),
        e("silence", 200, { dureeMs: 40_000 }),
        e("silence", 300, { dureeMs: 40_000 }),
      ],
      FIN,
    );
    expect(c.sorties.map((s) => s.dureeMs)).toEqual([95_000, 40_000, 40_000]);
    const resultat = calculerIndice(c, []);
    expect(resultat.valeur).toBe(100);
    expect(resultat.detail).toEqual([{ signal: "sortie", nombre: 3, points: 125 }]);
  });

  it("une coupure restée ouverte n'absorbe pas les silences suivants", () => {
    const c = consolider(
      [
        e("hors_ligne", 5, { sequence: 1 }),
        e("silence", 100, { dureeMs: 40_000 }),
        e("silence", 200, { dureeMs: 40_000 }),
      ],
      FIN,
    );
    expect(c.coupures).toEqual([{ debut: a(5), fin: a(100), dureeMs: 95_000, questionIndex: 2 }]);
    expect(c.sorties.map((s) => s.dureeMs)).toEqual([40_000]);
    expect(calculerIndice(c, []).valeur).toBe(40);
  });

  it("pas de double coupure quand un silence commence à l'ouverture de la coupure", () => {
    const c = consolider(
      [
        e("hors_ligne", 0, { sequence: 1 }),
        e("silence", 30, { dureeMs: 30_000 }),
        e("en_ligne", 30, { sequence: 2 }),
      ],
      FIN,
    );
    expect(c.coupures).toEqual([{ debut: a(0), fin: a(30), dureeMs: 30_000, questionIndex: 2 }]);
    expect(calculerIndice(c, []).valeur).toBe(0);
  });

  it("une coupure n'est pas reclassée par une sortie ultérieure", () => {
    const c = consolider(
      [
        e("silence", 30, { dureeMs: 30_000 }),
        e("hors_ligne", 30, { sequence: 1 }),
        e("en_ligne", 30, { sequence: 2 }),
        e("masquee", 35, { sequence: 3 }),
        e("visible", 45, { sequence: 4 }),
      ],
      FIN,
    );
    expect(c.coupures).toHaveLength(1);
    expect(c.sorties.map((s) => s.dureeMs)).toEqual([10_000]);
    expect(calculerIndice(c, []).valeur).toBe(10);
  });

  it("compte la réponse rapide quand le retour est la validation elle-même", () => {
    const c = consolider(
      [
        e("silence", 40, { dureeMs: 40_000 }),
        e("masquee", 40, { sequence: 1 }),
        e("visible", 40, { sequence: 2 }),
      ],
      FIN,
    );
    expect(calculerIndice(c, [a(40)]).valeur).toBe(52);
  });

  it("les cinq scénarios de D6 restent inchangés, événements fournis dans l'ordre inverse", () => {
    expect(indice([e("visible", 10), e("masquee", 2)]).valeur).toBe(8);
    expect(
      indice([
        e("visible", 40, { sequence: 2 }),
        e("masquee", 40, { sequence: 1 }),
        e("silence", 40, { dureeMs: 40_000 }),
      ]).valeur,
    ).toBe(40);
    expect(
      indice([
        e("en_ligne", 30, { sequence: 2 }),
        e("hors_ligne", 30, { sequence: 1 }),
        e("silence", 30, { dureeMs: 30_000 }),
      ]).valeur,
    ).toBe(0);
    expect(indice([e("silence", 60, { dureeMs: 60_000 })]).valeur).toBe(45);
    expect(indice([e("focus_revenu", 4), e("focus_perdu", 1)]).valeur).toBe(6);
  });
});
