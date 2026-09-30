import { describe, expect, it } from "vitest";
import {
  alerteFait,
  LIBELLES_SIGNAL,
  libelleFait,
  MENTION_INDICE,
  PONDERATION_V1,
  SEUIL_SILENCE_MS,
  SIGNAUX,
  TYPES_EVENEMENT_TELEPHONE,
  type Fait,
} from "./regles-surveillance";

const LE = new Date("2026-09-29T08:42:13.000Z");

function fait(partiel: Partial<Fait>): Fait {
  return { type: "sortie", le: LE, dureeMs: 38_000, questionIndex: 6, ...partiel };
}

describe("règles de la surveillance", () => {
  it("fixe les valeurs du spec (§8.2 et §8.4)", () => {
    expect(SEUIL_SILENCE_MS).toBe(15_000);
    expect(PONDERATION_V1).toMatchObject({
      version: 1,
      sortieMin: 5,
      sortieMax: 45,
      focus: 6,
      pressePapiers: 10,
      reponseRapide: 12,
      secondAppareil: 20,
      ecranPartage: 5,
      plafond: 100,
    });
    expect(TYPES_EVENEMENT_TELEPHONE).toContain("masquee");
    expect(SIGNAUX.every((s) => LIBELLES_SIGNAL[s].length > 0)).toBe(true);
    expect(MENTION_INDICE).toContain("Ce n’est pas une preuve.");
  });

  it("donne le dernier événement d'un participant (maquette « Suivi en direct »)", () => {
    expect(libelleFait(fait({}))).toBe("Sortie 38 s · Q7 · 10:42:13");
    expect(libelleFait(fait({ type: "focus", dureeMs: 3_000, questionIndex: 10 }))).toBe(
      "Perte de focus 3 s · Q11",
    );
    expect(libelleFait(fait({ type: "presse_papiers", dureeMs: null, questionIndex: 3 }))).toBe(
      "Copier-coller · Q4 · 10:42:13",
    );
    expect(libelleFait(fait({ type: "ecran_partage", dureeMs: null, questionIndex: 9 }))).toBe(
      "Écran partagé · Q10 · 10:42:13",
    );
    expect(libelleFait(fait({ type: "coupure" }))).toBe("Réseau perdu · 10:42:13");
    expect(libelleFait(fait({ type: "second_appareil", questionIndex: null }))).toBe(
      "2e appareil · 10:42:13",
    );
    expect(libelleFait(fait({ type: "rechargement", questionIndex: null }))).toBe("Rechargement · 10:42:13");
    expect(libelleFait(fait({ questionIndex: null }))).toBe("Sortie 38 s · 10:42:13");
    expect(libelleFait(fait({ type: "appareil_autorise", questionIndex: null }))).toBe(
      "Téléphone changé · 10:42:13",
    );
  });

  it("donne les alertes en direct, sans alerte pour les faits mineurs", () => {
    expect(alerteFait(fait({}), "DUPUIS Hugo")).toEqual({
      titre: "Sortie de l’application · 38 s",
      detail: "DUPUIS Hugo — pendant la question 7.",
    });
    expect(alerteFait(fait({ type: "ecran_partage", questionIndex: 9 }), "MOREAU Yanis")).toEqual({
      titre: "Écran partagé détecté",
      detail: "MOREAU Yanis — pendant la question 10.",
    });
    expect(alerteFait(fait({ type: "presse_papiers", questionIndex: null }), "LEROY Chloé")).toEqual({
      titre: "Copier-coller",
      detail: "LEROY Chloé.",
    });
    expect(alerteFait(fait({ type: "coupure" }), "BERNARD Tom")).toEqual({
      titre: "Connexion perdue",
      detail: "BERNARD Tom — coupure réseau, non comptée dans l’indice.",
    });
    expect(alerteFait(fait({ type: "focus" }), "X")).toBeNull();
    expect(alerteFait(fait({ type: "second_appareil" }), "X")).toBeNull();
    expect(alerteFait(fait({ type: "rechargement" }), "X")).toBeNull();
    expect(alerteFait(fait({ type: "appareil_autorise" }), "X")).toBeNull();
  });

  it("nomme le changement de téléphone autorisé, sans point", () => {
    expect(SIGNAUX.at(-1)).toBe("appareil_autorise");
    expect(LIBELLES_SIGNAL.appareil_autorise).toBe("Changement de téléphone autorisé (non compté)");
  });
});
