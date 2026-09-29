import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { delaiApresEchec, Interrogation } from "./interrogation";

/** Faux document : visibilité modifiable et événement « visibilitychange ». */
function fauxDocument() {
  const cible = new EventTarget();
  const doc = Object.assign(cible, { visibilityState: "visible" as DocumentVisibilityState });
  return {
    doc,
    changer(etat: DocumentVisibilityState) {
      doc.visibilityState = etat;
      cible.dispatchEvent(new Event("visibilitychange"));
    },
  };
}

/** Compteur d'appels réussis : chaque appel renvoie son numéro. */
function compteur() {
  const etat = { n: 0 };
  return {
    etat,
    appeler: async () => {
      etat.n += 1;
      return etat.n;
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("delaiApresEchec", () => {
  it("vaut 1 s, puis double, plafonné à 30 s", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(delaiApresEchec)).toEqual([
      1000, 1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ]);
  });
});

describe("Interrogation", () => {
  it("appelle aussitôt, puis à la période donnée par chaque résultat, et s'arrête", async () => {
    const { appeler } = compteur();
    const recus: number[] = [];
    const i = new Interrogation<number>({
      appeler,
      periodeMs: () => 2000,
      surResultat: (r) => recus.push(r),
    });
    i.demarrer();
    i.demarrer();
    await vi.advanceTimersByTimeAsync(0);
    expect(recus).toEqual([1]);
    await vi.advanceTimersByTimeAsync(1999);
    expect(recus).toEqual([1]);
    await vi.advanceTimersByTimeAsync(1);
    expect(recus).toEqual([1, 2]);
    i.arreter();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(recus).toEqual([1, 2]);
  });

  it("n'appelle plus quand la période vaut null, et repart sur relancer()", async () => {
    const { appeler, etat } = compteur();
    const i = new Interrogation<number>({ appeler, periodeMs: () => null, surResultat: () => undefined });
    i.relancer();
    expect(etat.n).toBe(0);
    i.demarrer();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(etat.n).toBe(1);
    i.relancer();
    await vi.advanceTimersByTimeAsync(0);
    expect(etat.n).toBe(2);
    i.arreter();
  });

  it("espace les essais après des échecs, les compte, et repart à zéro après un succès", async () => {
    const echecs: number[] = [];
    const recus: number[] = [];
    let tentatives = 0;
    const i = new Interrogation<number>({
      appeler: async () => {
        tentatives += 1;
        if (tentatives <= 3) throw new Error("réseau coupé");
        return tentatives;
      },
      periodeMs: () => 5000,
      surResultat: (r) => recus.push(r),
      surEchec: (n) => echecs.push(n),
    });
    i.demarrer();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(echecs).toEqual([1, 2, 3]);
    await vi.advanceTimersByTimeAsync(3999);
    expect(recus).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(recus).toEqual([4]);
    i.arreter();
  });

  it("repart de zéro échec après arreter() puis demarrer()", async () => {
    const echecs: number[] = [];
    const i = new Interrogation<number>({
      appeler: async () => {
        throw new Error("réseau coupé");
      },
      periodeMs: () => 5000,
      surResultat: () => undefined,
      surEchec: (n) => echecs.push(n),
    });
    i.demarrer();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(echecs).toEqual([1, 2, 3]);
    i.arreter();
    i.demarrer();
    await vi.advanceTimersByTimeAsync(0);
    expect(echecs).toEqual([1, 2, 3, 1]);
    i.arreter();
  });

  it("relancer() pendant un appel : l'appel en cours est abandonné, un nouveau part aussitôt", async () => {
    const attente: { resoudre?: (valeur: number) => void } = {};
    const recus: number[] = [];
    let appels = 0;
    const i = new Interrogation<number>({
      appeler: () =>
        new Promise<number>((resoudre) => {
          appels += 1;
          attente.resoudre = resoudre;
        }),
      periodeMs: () => 60_000,
      surResultat: (r) => recus.push(r),
    });
    i.demarrer();
    await vi.advanceTimersByTimeAsync(0);
    expect(appels).toBe(1);
    const premier = attente.resoudre;
    i.relancer();
    await vi.advanceTimersByTimeAsync(0);
    expect(appels).toBe(2);
    // La réponse périmée du premier appel est ignorée ; seule celle du second compte.
    premier?.(1);
    attente.resoudre?.(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(recus).toEqual([2]);
    i.arreter();
  });

  it("ignore un résultat ou un échec arrivé après l'arrêt", async () => {
    const attente: { resoudre?: (valeur: number) => void; rejeter?: (erreur: Error) => void } = {};
    const recus: number[] = [];
    const echecs: number[] = [];
    const i = new Interrogation<number>({
      appeler: () =>
        new Promise<number>((resoudre, rejeter) => {
          attente.resoudre = resoudre;
          attente.rejeter = rejeter;
        }),
      periodeMs: () => 1000,
      surResultat: (r) => recus.push(r),
      surEchec: (n) => echecs.push(n),
    });
    i.demarrer();
    await vi.advanceTimersByTimeAsync(0);
    i.arreter();
    attente.resoudre?.(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(recus).toEqual([]);

    const j = new Interrogation<number>({
      appeler: () =>
        new Promise<number>((_, rejeter) => {
          attente.rejeter = rejeter;
        }),
      periodeMs: () => 1000,
      surResultat: (r) => recus.push(r),
      surEchec: (n) => echecs.push(n),
    });
    j.demarrer();
    await vi.advanceTimersByTimeAsync(0);
    j.arreter();
    attente.rejeter?.(new Error("trop tard"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(echecs).toEqual([]);
  });

  it("enseignant : suspendue quand l'onglet est masqué, reprise au retour au premier plan", async () => {
    const { doc, changer } = fauxDocument();
    vi.stubGlobal("document", doc);
    const { appeler, etat } = compteur();
    const i = new Interrogation<number>({
      appeler,
      periodeMs: () => 1000,
      surResultat: () => undefined,
      suspendreSiMasque: true,
    });
    i.demarrer();
    await vi.advanceTimersByTimeAsync(0);
    expect(etat.n).toBe(1);
    changer("hidden");
    await vi.advanceTimersByTimeAsync(5000);
    expect(etat.n).toBe(1);
    changer("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(etat.n).toBe(2);
    i.arreter();
  });

  it("étudiant : jamais suspendue, appel immédiat au retour au premier plan", async () => {
    const { doc, changer } = fauxDocument();
    vi.stubGlobal("document", doc);
    const { appeler, etat } = compteur();
    const i = new Interrogation<number>({ appeler, periodeMs: () => 60_000, surResultat: () => undefined });
    i.demarrer();
    await vi.advanceTimersByTimeAsync(0);
    changer("hidden");
    changer("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(etat.n).toBe(2);
    i.arreter();
    changer("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(etat.n).toBe(2);
  });
});
