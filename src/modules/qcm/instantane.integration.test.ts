import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { instantaneDuQcm } from "@/modules/qcm";
import { creerUtilisateur } from "@/test/comptes";
import { creerImageTest } from "@/test/images";
import { creerQcmTest, creerQuestionTest } from "@/test/qcm";

describe("instantaneDuQcm", () => {
  it("fige le QCM complet : bonnes réponses, barème, code coloré, images, liaisons", async () => {
    const u = await creerUtilisateur();
    const q = await creerQcmTest(u.id, {
      titre: "Algorithmique",
      statut: "pret",
      modeChrono: "global",
      dureeGlobaleS: 1200,
    });
    const illustration = await creerImageTest(u.id, { largeur: 800, hauteur: 600 });
    const q1 = await creerQuestionTest(q.id, {
      type: "multiple",
      enonce: "Qu’affiche ce programme ?",
      imageId: illustration.id,
      code: { langage: "python", source: "print(4)" },
      propositions: [
        { texte: "4", correcte: true },
        { texte: "", imageId: illustration.id, correcte: true },
        { texte: "16", correcte: false },
      ],
      pointsBonne: 2,
      pointsMauvaise: -0.5,
      pointsVide: -0.25,
      lieeASuivante: true,
    });
    const q2 = await creerQuestionTest(q.id, { type: "vrai_faux", enonce: "Une pile suit l’ordre FIFO." });
    const contenu = await instantaneDuQcm(db(), q.id);
    expect(contenu).toMatchObject({
      version: 1,
      titre: "Algorithmique",
      modeChrono: "global",
      dureeGlobaleS: 1200,
    });
    expect(contenu.questions.map((x) => x.cle)).toEqual([q1.id, q2.id]);
    const [premiere] = contenu.questions;
    expect(premiere).toMatchObject({
      type: "multiple",
      enonce: "Qu’affiche ce programme ?",
      image: { id: illustration.id, largeur: 800, hauteur: 600 },
      propositions: [
        { texte: "4", image: null, correcte: true },
        { texte: "", image: { id: illustration.id, largeur: 800, hauteur: 600 }, correcte: true },
        { texte: "16", image: null, correcte: false },
      ],
      pointsBonne: 2,
      pointsMauvaise: -0.5,
      pointsVide: -0.25,
      dureeS: null,
      lieeASuivante: true,
    });
    expect(premiere?.code?.libelle).toBe("Python");
    expect(premiere?.code?.lignes[0]?.map((j) => j.texte).join("")).toBe("print(4)");
  });

  it("fixe la durée effective de chaque question en chrono par question", async () => {
    const u = await creerUtilisateur();
    const q = await creerQcmTest(u.id, { statut: "pret", modeChrono: "par_question", dureeQuestionS: 30 });
    await creerQuestionTest(q.id);
    await creerQuestionTest(q.id, { dureeS: 90 });
    const contenu = await instantaneDuQcm(db(), q.id);
    expect(contenu.dureeGlobaleS).toBeNull();
    expect(contenu.questions.map((x) => x.dureeS)).toEqual([30, 90]);
  });

  it("ignore la durée globale hors du chrono global", async () => {
    const u = await creerUtilisateur();
    const q = await creerQcmTest(u.id, { statut: "pret", modeChrono: "aucun", dureeGlobaleS: 600 });
    await creerQuestionTest(q.id);
    const contenu = await instantaneDuQcm(db(), q.id);
    expect(contenu).toMatchObject({ modeChrono: "aucun", dureeGlobaleS: null });
    expect(contenu.questions[0]?.dureeS).toBeNull();
  });

  it("lève « QCM introuvable. » pour un QCM inconnu", async () => {
    await expect(instantaneDuQcm(db(), randomUUID())).rejects.toMatchObject({
      code: "INTROUVABLE",
      message: "QCM introuvable.",
    });
  });
});
