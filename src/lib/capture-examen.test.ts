import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LotEvenementsTelephone } from "./regles-surveillance";
import {
  CaptureExamen,
  DELAI_REESSAI_MS,
  ESPACEMENT_ECRAN_PARTAGE_MS,
  identifiantChargement,
  type OptionsCapture,
} from "./capture-examen";

/** Fenêtre et document simulés : tailles et visibilité modifiables, événements à la demande. */
function environnement(reponses: boolean[] = []) {
  const fenetre = Object.assign(new EventTarget(), { innerWidth: 400, innerHeight: 800 });
  const document = Object.assign(new EventTarget(), {
    visibilityState: "visible" as DocumentVisibilityState,
  });
  const lots: LotEvenementsTelephone[] = [];
  const attentes: ((ok: boolean) => void)[] = [];
  let numero = 0;
  let horloge = 1_000_000;
  const options: OptionsCapture = {
    fenetre,
    document,
    chargement: "chargement-test",
    numeroter: () => (numero += 1),
    envoyer: (lot) => {
      lots.push(lot);
      const reponse = reponses.shift();
      if (reponse !== undefined) return Promise.resolve(reponse);
      return new Promise<boolean>((resoudre) => attentes.push(resoudre));
    },
    maintenant: () => horloge,
  };
  return {
    options,
    fenetre,
    document,
    lots,
    /** Termine le plus ancien envoi resté en suspens. */
    repondre(ok: boolean) {
      attentes.shift()?.(ok);
    },
    avancer(ms: number) {
      horloge += ms;
    },
    visibilite(etat: DocumentVisibilityState) {
      document.visibilityState = etat;
      document.dispatchEvent(new Event("visibilitychange"));
    },
    taille(largeur: number, hauteur: number) {
      fenetre.innerWidth = largeur;
      fenetre.innerHeight = hauteur;
      fenetre.dispatchEvent(new Event("resize"));
    },
    /** Types reçus par le « serveur », une fois par numéro (il dédoublonne), dans l'ordre des numéros. */
    recus: () =>
      [...new Map(lots.flatMap((l) => l.evenements.map((e) => [e.n, e.type] as const))).entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, type]) => type),
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("CaptureExamen", () => {
  it("envoie « debut » au démarrage, une seule fois, avec le chargement et des numéros croissants", async () => {
    const e = environnement([true, true]);
    const capture = new CaptureExamen(e.options);
    capture.demarrer();
    capture.demarrer();
    await vi.advanceTimersByTimeAsync(0);
    e.document.dispatchEvent(new Event("copy"));
    await vi.advanceTimersByTimeAsync(0);
    expect(e.lots).toEqual([
      { chargement: "chargement-test", evenements: [{ n: 1, type: "debut" }] },
      { chargement: "chargement-test", evenements: [{ n: 2, type: "copie" }] },
    ]);
    capture.arreter();
  });

  it("traduit visibilité, sortie de page, focus, presse-papiers et réseau", async () => {
    const e = environnement(Array.from({ length: 20 }, () => true));
    const capture = new CaptureExamen(e.options);
    capture.demarrer();
    e.fenetre.dispatchEvent(new Event("blur"));
    e.fenetre.dispatchEvent(new Event("focus"));
    e.visibilite("hidden");
    // Page masquée : une perte de focus n'est pas une perte de focus « page visible ».
    e.fenetre.dispatchEvent(new Event("blur"));
    e.fenetre.dispatchEvent(new Event("pagehide"));
    e.visibilite("visible");
    for (const nom of ["copy", "cut", "paste"]) e.document.dispatchEvent(new Event(nom));
    e.fenetre.dispatchEvent(new Event("offline"));
    e.fenetre.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(e.recus()).toEqual([
      "debut",
      "focus_perdu",
      "focus_revenu",
      "masquee",
      "masquee",
      "visible",
      "copie",
      "coupe",
      "colle",
      "hors_ligne",
      "en_ligne",
    ]);
    capture.arreter();
  });

  it("un seul envoi à la fois : ce qui arrive pendant un envoi part au suivant, par lots de 50", async () => {
    const e = environnement();
    const capture = new CaptureExamen(e.options);
    capture.demarrer();
    for (let i = 0; i < 60; i += 1) e.document.dispatchEvent(new Event("copy"));
    await vi.advanceTimersByTimeAsync(0);
    expect(e.lots).toHaveLength(1);
    e.repondre(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(e.lots.map((l) => l.evenements.length)).toEqual([1, 50]);
    e.repondre(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(e.lots.map((l) => l.evenements.length)).toEqual([1, 50, 10]);
    e.repondre(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(e.lots).toHaveLength(3);
    capture.arreter();
  });

  it("garde la file après un échec et réessaie 3 s plus tard ; le retour du réseau relance aussitôt", async () => {
    const e = environnement([false, false, true, true]);
    const capture = new CaptureExamen(e.options);
    capture.demarrer();
    await vi.advanceTimersByTimeAsync(0);
    expect(e.lots).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(DELAI_REESSAI_MS - 1);
    expect(e.lots).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(e.lots.map((l) => l.evenements.map((x) => x.n))).toEqual([[1], [1]]);
    e.fenetre.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(e.lots.map((l) => l.evenements.map((x) => x.n))).toEqual([[1], [1], [1, 2]]);
    await vi.advanceTimersByTimeAsync(DELAI_REESSAI_MS * 2);
    expect(e.lots).toHaveLength(3);
    capture.arreter();
  });

  it("une page masquée part aussitôt, même pendant un envoi ou une attente", async () => {
    const e = environnement();
    const capture = new CaptureExamen(e.options);
    capture.demarrer();
    await vi.advanceTimersByTimeAsync(0);
    expect(e.lots).toHaveLength(1);
    e.visibilite("hidden");
    await vi.advanceTimersByTimeAsync(0);
    expect(e.lots.map((l) => l.evenements.map((x) => x.type))).toEqual([["debut"], ["debut", "masquee"]]);
    e.repondre(false);
    e.repondre(true);
    await vi.advanceTimersByTimeAsync(DELAI_REESSAI_MS);
    // Tout est parti avec l'envoi de la sortie : rien n'est renvoyé.
    expect(e.lots).toHaveLength(2);
    capture.arreter();
  });

  it("signale un écran partagé : page visible, plus de 20 %, hors rotation, au plus un toutes les 30 s", async () => {
    const e = environnement(Array.from({ length: 20 }, () => true));
    const capture = new CaptureExamen(e.options);
    capture.demarrer();
    e.taille(400, 700); // 12,5 % : rien
    e.taille(400, 560); // 30 % par rapport au départ, par petits pas : signalé
    e.avancer(1_000);
    e.taille(400, 800); // de nouveau plus de 20 %, mais moins de 30 s après : rien
    e.avancer(ESPACEMENT_ECRAN_PARTAGE_MS);
    e.taille(800, 400); // rotation : rien, nouvelle référence
    e.taille(800, 200); // 50 % après la rotation : signalé
    e.avancer(ESPACEMENT_ECRAN_PARTAGE_MS);
    e.visibilite("hidden");
    e.taille(800, 400); // page masquée : rien
    await vi.advanceTimersByTimeAsync(0);
    expect(e.recus().filter((t) => t === "ecran_partage")).toHaveLength(2);
    capture.arreter();
  });

  it("s'arrête : plus aucun écouteur, plus aucun nouvel essai", async () => {
    const e = environnement([false]);
    const capture = new CaptureExamen(e.options);
    capture.demarrer();
    await vi.advanceTimersByTimeAsync(0);
    capture.arreter();
    e.document.dispatchEvent(new Event("copy"));
    await vi.advanceTimersByTimeAsync(DELAI_REESSAI_MS * 2);
    expect(e.lots).toHaveLength(1);
  });

  it("un envoi qui lève compte comme un échec", async () => {
    const e = environnement();
    e.options.envoyer = vi.fn().mockRejectedValueOnce(new Error("réseau")).mockResolvedValue(true);
    const capture = new CaptureExamen(e.options);
    capture.demarrer();
    await vi.advanceTimersByTimeAsync(DELAI_REESSAI_MS);
    expect(e.options.envoyer).toHaveBeenCalledTimes(2);
    capture.arreter();
  });
});

describe("identifiantChargement", () => {
  it("donne 16 caractères base64url, différents à chaque appel", () => {
    const a = identifiantChargement();
    expect(a).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(identifiantChargement()).not.toBe(a);
  });
});
