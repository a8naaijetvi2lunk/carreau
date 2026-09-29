import { describe, expect, it } from "vitest";
import { analyserTableau } from "./analyse";
import type { Cellule } from "./lecture";
import { MESSAGES_IMPORT } from "./messages";

describe("analyserTableau : en-tête", () => {
  it.each([
    [["Nom", "Prénom"], ["Dupont", "Léa"], null],
    [["NOM DE FAMILLE", "Prénom usuel"], ["Dupont", "Léa"], null],
    [
      ["n° étudiant", "Nom usuel", "Premier prénom", "email"],
      ["2201", "Dupont", "Léa", "lea@exemple.fr"],
      null,
    ],
    [["nom", "prenoms", "Tiers-temps (oui/non)"], ["Dupont", "Léa", "oui"], true],
    [["Prénom", "Nom", "1/3 temps"], ["Léa", "Dupont", ""], false],
  ] as [Cellule[], Cellule[], boolean | null][])("reconnaît les titres %j", (titres, ligne, tiersTemps) => {
    expect(analyserTableau([titres, ligne]).lignes).toEqual([
      { numero: 2, nom: "Dupont", prenom: "Léa", tiersTemps },
    ]);
  });

  it("prend la première ligne non vide comme en-tête et numérote les lignes du fichier", () => {
    const analyse = analyserTableau([
      [null, null],
      ["", ""],
      ["Nom", "Prénom"],
      ["Dupont", "Léa"],
    ]);
    expect(analyse.lignes).toEqual([{ numero: 4, nom: "Dupont", prenom: "Léa", tiersTemps: null }]);
    expect(analyse.colonneTiersTemps).toBe(false);
  });

  it.each([
    [
      [
        ["Nom", "Tiers-temps"],
        ["Dupont", "oui"],
      ],
    ],
    [
      [
        ["Élève", "Groupe"],
        ["Dupont Léa", "TD1"],
      ],
    ],
  ])("refuse une liste sans titres Nom et Prénom : %j", (tableau) => {
    expect(() => analyserTableau(tableau)).toThrow(MESSAGES_IMPORT.enTete);
  });

  it("refuse une liste vide ou sans étudiant", () => {
    expect(() => analyserTableau([])).toThrow(MESSAGES_IMPORT.aucunEtudiant);
    expect(() =>
      analyserTableau([
        ["Nom", "Prénom"],
        [null, ""],
      ]),
    ).toThrow(MESSAGES_IMPORT.aucunEtudiant);
  });

  it("refuse plus de 500 lignes de données", () => {
    const tableau: Cellule[][] = [
      ["Nom", "Prénom"],
      ...Array.from({ length: 501 }, (_, i) => [`N${i}`, "P"]),
    ];
    expect(() => analyserTableau(tableau)).toThrow(MESSAGES_IMPORT.tropDeLignes);
  });
});

describe("analyserTableau : lignes", () => {
  it("nettoie les espaces et ignore les lignes vides et les autres colonnes", () => {
    const analyse = analyserTableau([
      ["Nom", "Prénom", "Email"],
      ["  DUPONT ", " Léa   Marie ", "lea@exemple.fr"],
      [null, null, null],
      ["Martin", "Inès", ""],
    ]);
    expect(analyse.lignes).toEqual([
      { numero: 2, nom: "DUPONT", prenom: "Léa Marie", tiersTemps: null },
      { numero: 4, nom: "Martin", prenom: "Inès", tiersTemps: null },
    ]);
    expect(analyse.rejets).toEqual([]);
  });

  it.each([
    ["oui", true],
    ["OUI", true],
    ["x", true],
    ["1", true],
    [1, true],
    [true, true],
    ["Tiers-temps", true],
    ["non", false],
    ["", false],
    [null, false],
    ["-", false],
    [0, false],
    [false, false],
    ["FAUX", false],
  ])("tiers-temps %j → %s", (valeur, attendu) => {
    const analyse = analyserTableau([
      ["Nom", "Prénom", "Tiers-temps"],
      ["Dupont", "Léa", valeur],
    ]);
    expect(analyse.lignes[0]?.tiersTemps).toBe(attendu);
    expect(analyse.colonneTiersTemps).toBe(true);
  });

  it("rejette chaque ligne invalide avec son numéro et son motif, garde les autres", () => {
    const analyse = analyserTableau([
      ["Nom", "Prénom", "Tiers-temps"],
      ["Dupont", "Léa", "oui"],
      ["Martin", "", ""],
      ["", "", "oui"],
      ["x".repeat(101), "Hugo", ""],
      ["Girard", "Enzo", "peut-être bien que oui, peut-être bien que non"],
      ["DUPONT", "lea", "non"],
      ["-", "Tom", ""],
      [2, 3, 1.5],
      ["Nguyen", "Minh", 1],
    ]);
    expect(analyse.lignes).toEqual([
      { numero: 2, nom: "Dupont", prenom: "Léa", tiersTemps: true },
      { numero: 10, nom: "Nguyen", prenom: "Minh", tiersTemps: true },
    ]);
    expect(analyse.rejets).toEqual([
      { numero: 3, motif: "Le prénom est obligatoire." },
      { numero: 4, motif: "Le nom est obligatoire. Le prénom est obligatoire." },
      { numero: 5, motif: "Le nom dépasse 100 caractères." },
      {
        numero: 6,
        motif: "Tiers-temps non reconnu : « peut-être bien que oui, peut-ê » (oui ou non attendu).",
      },
      { numero: 7, motif: "Même nom et même prénom qu'à la ligne 2." },
      { numero: 8, motif: "Le nom doit contenir au moins une lettre ou un chiffre." },
      { numero: 9, motif: "Tiers-temps non reconnu : « 1.5 » (oui ou non attendu)." },
    ]);
  });
});
