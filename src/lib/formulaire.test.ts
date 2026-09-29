import { describe, expect, it } from "vitest";
import { erreursParChamp, lireCase, lireChamp, lireChampJson, lireFichier } from "./formulaire";

describe("lecture d'un formulaire", () => {
  it("lireChamp renvoie le texte, ou une chaîne vide pour un champ absent ou un fichier", () => {
    const formulaire = new FormData();
    formulaire.set("email", "claire@exemple.fr");
    formulaire.set("piece", new Blob(["x"]), "x.txt");
    expect(lireChamp(formulaire, "email")).toBe("claire@exemple.fr");
    expect(lireChamp(formulaire, "absent")).toBe("");
    expect(lireChamp(formulaire, "piece")).toBe("");
  });

  it("lireCase est vraie si la case est présente", () => {
    const formulaire = new FormData();
    formulaire.set("resterConnecte", "on");
    expect(lireCase(formulaire, "resterConnecte")).toBe(true);
    expect(lireCase(formulaire, "autre")).toBe(false);
  });
});

describe("erreursParChamp", () => {
  it("garde le premier message de chaque champ de premier niveau", () => {
    expect(
      erreursParChamp([
        { chemin: "email", message: "Adresse invalide." },
        { chemin: "email", message: "Autre message." },
        { chemin: "role.0", message: "Rôle inconnu." },
        { chemin: "", message: "Sans champ." },
      ]),
    ).toEqual({ email: "Adresse invalide.", role: "Rôle inconnu." });
  });

  it("ignore des détails qui ne sont pas une liste de { chemin, message }", () => {
    expect(erreursParChamp(undefined)).toEqual({});
    expect(erreursParChamp({ raison: "x" })).toEqual({});
    expect(erreursParChamp([null, { chemin: 1, message: "x" }])).toEqual({});
  });
});

describe("fichiers et JSON d'un formulaire", () => {
  it("lireFichier renvoie le fichier choisi", () => {
    const formulaire = new FormData();
    formulaire.set("fichier", new File(["Nom;Prénom"], "classe.csv", { type: "text/csv" }));
    expect(lireFichier(formulaire, "fichier")?.name).toBe("classe.csv");
  });

  it("lireFichier renvoie null sans fichier choisi, pour un texte ou un champ absent", () => {
    const formulaire = new FormData();
    formulaire.set("vide", new File([], ""));
    formulaire.set("texte", "Nom;Prénom");
    expect(lireFichier(formulaire, "vide")).toBeNull();
    expect(lireFichier(formulaire, "texte")).toBeNull();
    expect(lireFichier(formulaire, "absent")).toBeNull();
  });

  it("lireChampJson analyse le JSON, et renvoie undefined s'il est absent ou invalide", () => {
    const formulaire = new FormData();
    formulaire.set("lignes", '[{"nom":"Dupont"}]');
    formulaire.set("casse", "[{");
    formulaire.set("fichier", new File(["[]"], "a.json"));
    expect(lireChampJson(formulaire, "lignes")).toEqual([{ nom: "Dupont" }]);
    expect(lireChampJson(formulaire, "casse")).toBeUndefined();
    expect(lireChampJson(formulaire, "fichier")).toBeUndefined();
    expect(lireChampJson(formulaire, "absent")).toBeUndefined();
  });
});
