import { describe, expect, it } from "vitest";
import type { VueSuivi } from "@/lib/vue-session";
import {
  filtrerLignes,
  libelleAvancement,
  libelleProgression,
  libelleQuand,
  LIBELLES_STATUT_SUIVI,
  lignesTableau,
  TONS_STATUT_SESSION,
  tonIndice,
  type FiltreSuivi,
} from "./libelles";

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

describe("tableau de bord", () => {
  const suivi = {
    participants: [
      {
        participationId: "p1",
        nom: "Dupont",
        prenom: "Léa",
        tiersTemps: false,
        informationLue: true,
        avancement: { repondues: 6, total: 20, terminee: false },
        statut: "en_cours",
        indice: 12,
        dernierFait: "Perte de focus 3 s · Q4",
      },
      {
        participationId: "p2",
        nom: "Dupuis",
        prenom: "Hugo",
        tiersTemps: true,
        informationLue: true,
        avancement: { repondues: 20, total: 20, terminee: true },
        statut: "terminee",
        indice: 64,
        dernierFait: null,
      },
      {
        participationId: "p3",
        nom: "Bernard",
        prenom: "Tom",
        tiersTemps: false,
        informationLue: true,
        avancement: { repondues: 2, total: 20, terminee: false },
        statut: "deconnecte",
        indice: 12,
        dernierFait: "Réseau perdu · 10:44:12",
      },
    ],
    absents: [{ etudiantId: "e4", nom: "Martin", prenom: "Zoé" }],
  } as unknown as VueSuivi;

  it("met toute la classe dans la liste, triée par indice puis par nom", () => {
    const lignes = lignesTableau(suivi);
    expect(lignes.map((l) => [l.nom, l.statut, l.progression, l.indice])).toEqual([
      ["DUPUIS Hugo", "terminee", "20 / 20", 64],
      ["BERNARD Tom", "deconnecte", "Q3 / 20", 12],
      ["DUPONT Léa", "en_cours", "Q7 / 20", 12],
      ["MARTIN Zoé", "absent", null, null],
    ]);
    expect(lignes[0]?.tiersTemps).toBe(true);
  });

  it("filtre : en cours (déconnectés compris), terminés, absents", () => {
    const lignes = lignesTableau(suivi);
    const noms = (filtre: FiltreSuivi) => filtrerLignes(lignes, filtre).map((l) => l.nom);
    expect(noms("tous")).toHaveLength(4);
    expect(noms("en_cours")).toEqual(["BERNARD Tom", "DUPONT Léa"]);
    expect(noms("termines")).toEqual(["DUPUIS Hugo"]);
    expect(noms("absents")).toEqual(["MARTIN Zoé"]);
  });

  it("colore l'indice : 60 et plus fort, 20 à 59 moyen, sinon faible", () => {
    expect([0, 19, 20, 59, 60, 100].map(tonIndice)).toEqual([
      "faible",
      "faible",
      "moyen",
      "moyen",
      "fort",
      "fort",
    ]);
  });

  it("libelle le statut et la progression", () => {
    expect(LIBELLES_STATUT_SUIVI).toEqual({
      attente: "En attente",
      en_cours: "En cours",
      deconnecte: "Déconnecté",
      terminee: "Terminé",
      absent: "Absent",
    });
    expect(libelleProgression({ repondues: 0, total: 3, terminee: false })).toBe("Q1 / 3");
    expect(libelleProgression({ repondues: 3, total: 3, terminee: true })).toBe("3 / 3");
  });
});
