import { describe, expect, it } from "vitest";
import {
  dureeAvecTiersTempsS,
  LIBELLES_MOTIF_DEMANDE,
  LIBELLES_STATUT_SESSION,
  LIMITES_SESSION,
  MOTIFS_DEMANDE,
  nomComplet,
  nomCourt,
  STATUTS_SESSION,
  TYPES_SESSION,
} from "./regles-session";

describe("dureeAvecTiersTempsS", () => {
  it("multiplie la durée par 4/3 et arrondit à la seconde supérieure", () => {
    expect(dureeAvecTiersTempsS(1500)).toBe(2000);
    expect(dureeAvecTiersTempsS(1200)).toBe(1600);
    expect(dureeAvecTiersTempsS(30)).toBe(40);
    expect(dureeAvecTiersTempsS(7)).toBe(10);
    expect(dureeAvecTiersTempsS(1)).toBe(2);
  });
});

describe("noms affichés", () => {
  it("nomCourt : prénom et initiale du nom, en majuscule", () => {
    expect(nomCourt("Léa", "Dupont")).toBe("Léa D.");
    expect(nomCourt("Élise", "éluard")).toBe("Élise É.");
    expect(nomCourt("Tom", "  ")).toBe("Tom");
  });

  it("nomComplet : nom en majuscules, puis prénom", () => {
    expect(nomComplet("Léa", "Dupont")).toBe("DUPONT Léa");
    expect(nomComplet("Sacha", "Dupré")).toBe("DUPRÉ Sacha");
  });
});

describe("libellés et bornes", () => {
  it("nomme chaque statut de session et chaque motif de demande", () => {
    for (const statut of STATUTS_SESSION) expect(LIBELLES_STATUT_SESSION[statut]).not.toBe("");
    for (const motif of MOTIFS_DEMANDE) expect(LIBELLES_MOTIF_DEMANDE[motif]).not.toBe("");
    expect(LIBELLES_MOTIF_DEMANDE.reprise).toBe("Reprise sur un autre téléphone");
  });

  it("démarre 5 s après le clic et fait expirer une demande au bout de 10 min", () => {
    expect(LIMITES_SESSION.delaiDemarrageMs).toBe(5_000);
    expect(LIMITES_SESSION.dureeDemandeMs).toBe(600_000);
  });
});

describe("rattrapages", () => {
  it("distingue les sessions de classe et de rattrapage (spec §4.3)", () => {
    expect(TYPES_SESSION).toEqual(["classe", "rattrapage"]);
    expect(LIMITES_SESSION.rattrapageMax).toBe(500);
  });
});
