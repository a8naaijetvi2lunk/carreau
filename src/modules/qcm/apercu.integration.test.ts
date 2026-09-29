import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { journal } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { apercuQcm } from "@/modules/qcm";
import { acteurDe, creerUtilisateur } from "@/test/comptes";
import { creerImageTest } from "@/test/images";
import { creerQcmTest, creerQuestionTest } from "@/test/qcm";

async function acteur(): Promise<ActeurUtilisateur> {
  return acteurDe(await creerUtilisateur());
}

describe("apercuQcm", () => {
  it("rend chaque question comme la verra l'étudiant, code coloré, sans bonne réponse", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id, { titre: "Algorithmique", modeChrono: "global", dureeGlobaleS: 1200 });
    const illustration = await creerImageTest(a.id, { largeur: 800, hauteur: 600 });
    const q1 = await creerQuestionTest(q.id, {
      type: "multiple",
      enonce: "Qu'affiche ce programme ?",
      imageId: illustration.id,
      code: { langage: "python", source: "print(4)" },
      propositions: [
        { texte: "4", correcte: true },
        { texte: "", imageId: illustration.id, correcte: false },
      ],
    });
    await creerQuestionTest(q.id, { type: "vrai_faux", enonce: "Une pile suit l'ordre FIFO." });
    const apercu = await apercuQcm(a, { qcmId: q.id });
    expect(apercu).toMatchObject({
      id: q.id,
      titre: "Algorithmique",
      modeChrono: "global",
      dureeGlobaleS: 1200,
    });
    expect(apercu.questions).toHaveLength(2);
    const [premiere, seconde] = apercu.questions;
    expect(premiere).toEqual({
      vue: {
        rang: 1,
        total: 2,
        type: "multiple",
        enonce: "Qu'affiche ce programme ?",
        image: { url: `/api/images/${illustration.id}`, largeur: 800, hauteur: 600 },
        code: { libelle: "Python", lignes: [expect.arrayContaining([{ texte: "4", couleur: "#F0B37E" }])] },
        propositions: [
          { id: `${q1.id}:1`, texte: "4", image: null },
          {
            id: `${q1.id}:2`,
            texte: "",
            image: { url: `/api/images/${illustration.id}`, largeur: 800, hauteur: 600 },
          },
        ],
      },
      dureeS: null,
    });
    expect(seconde?.vue).toMatchObject({ rang: 2, total: 2, type: "vrai_faux", code: null, image: null });
    expect(JSON.stringify(apercu)).not.toContain("correcte");
  });

  it("donne la durée de chaque question en chrono par question (surcharge, sinon durée du QCM)", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id, { modeChrono: "par_question", dureeQuestionS: 45 });
    await creerQuestionTest(q.id, { dureeS: 30 });
    await creerQuestionTest(q.id);
    expect((await apercuQcm(a, { qcmId: q.id })).questions.map((x) => x.dureeS)).toEqual([30, 45]);
  });

  it.each(["pret", "archive"] as const)("s'ouvre aussi sur un QCM %s", async (statut) => {
    const a = await acteur();
    const q = await creerQcmTest(a.id, { statut });
    await creerQuestionTest(q.id);
    await expect(apercuQcm(a, { qcmId: q.id })).resolves.toHaveProperty("questions");
  });

  it("répond « introuvable » pour le QCM d'un autre compte et journalise le refus", async () => {
    const a = await acteur();
    const b = await acteur();
    const q = await creerQcmTest(a.id);
    await expect(apercuQcm(b, { qcmId: q.id })).rejects.toMatchObject({ code: "INTROUVABLE" });
    await expect(apercuQcm(b, { qcmId: randomUUID() })).rejects.toMatchObject({ code: "INTROUVABLE" });
    const refus = await db()
      .select()
      .from(journal)
      .where(and(eq(journal.acteurId, b.id), eq(journal.action, "acces.refus")));
    expect(refus.map((r) => r.details)).toEqual([
      { action: "qcm.apercu", role: "enseignant", motif: "ressource_autrui" },
    ]);
  });
});
