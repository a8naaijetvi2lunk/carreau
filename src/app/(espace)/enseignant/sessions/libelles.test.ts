import { describe, expect, it } from "vitest";
import { libelleAvancement, libelleQuand, TONS_STATUT_SESSION } from "./libelles";

const base = {
  creeLe: new Date("2026-09-29T08:00:00.000Z"),
  creneauPrevuLe: null,
  demarreLe: null,
  termineLe: null,
};

describe("libelleQuand", () => {
  it("salle d'attente : créneau prévu en heure de Paris, ou « Sans créneau »", () => {
    expect(libelleQuand({ ...base, statut: "attente" })).toBe("Sans créneau");
    expect(
      libelleQuand({ ...base, statut: "attente", creneauPrevuLe: new Date("2026-09-30T06:30:00.000Z") }),
    ).toBe("Prévue le 30/09/2026 08:30");
  });

  it("en cours, terminée, annulée : la date de l'événement", () => {
    const quand = new Date("2026-09-29T12:15:00.000Z");
    expect(libelleQuand({ ...base, statut: "en_cours", demarreLe: quand })).toBe(
      "Démarrée le 29/09/2026 14:15",
    );
    expect(libelleQuand({ ...base, statut: "terminee", termineLe: quand })).toBe(
      "Terminée le 29/09/2026 14:15",
    );
    expect(libelleQuand({ ...base, statut: "annulee", termineLe: quand })).toBe(
      "Annulée le 29/09/2026 14:15",
    );
  });

  it("donne une couleur d'étiquette à chaque statut", () => {
    expect(TONS_STATUT_SESSION).toEqual({
      attente: "bleu",
      en_cours: "sombre",
      terminee: "neutre",
      annulee: "neutre",
    });
  });
});

describe("libelleAvancement", () => {
  it("donne la question en cours, puis « Terminé »", () => {
    expect(libelleAvancement({ repondues: 0, total: 20, terminee: false })).toBe("Question 1 / 20");
    expect(libelleAvancement({ repondues: 2, total: 20, terminee: false })).toBe("Question 3 / 20");
    expect(libelleAvancement({ repondues: 20, total: 20, terminee: true })).toBe("Terminé");
  });
});
