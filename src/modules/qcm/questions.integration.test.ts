import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { journal, proposition, qcm, question } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { MESSAGE_POINTS_NOMBRE } from "@/lib/points";
import { MESSAGE_DUREE_QUESTION } from "@/lib/regles-qcm";
import {
  ajouterQuestion,
  deplacerQuestion,
  enregistrerQuestion,
  lierQuestion,
  MESSAGE_QCM_PLEIN,
  supprimerQuestion,
  type SaisieQuestion,
} from "@/modules/qcm";
import { acteurDe, creerUtilisateur } from "@/test/comptes";
import { creerImageTest } from "@/test/images";
import { creerQcmTest, creerQuestionTest } from "@/test/qcm";

const DEBUT = Date.parse("2026-09-29T08:00:00.000Z");
const horloge = horlogeFixe(DEBUT);
const MOINS = String.fromCharCode(0x2212);
const PRET = "Ce QCM est prêt : repasse-le en brouillon pour le modifier.";
const ARCHIVE = "Ce QCM est archivé : restaure-le pour le modifier.";

beforeEach(() => {
  horloge.fixer(DEBUT);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

async function acteur(role: ActeurUtilisateur["role"] = "enseignant"): Promise<ActeurUtilisateur> {
  return acteurDe(await creerUtilisateur({ role }));
}

async function journalDe(acteurId: string, action: string) {
  return db()
    .select()
    .from(journal)
    .where(and(eq(journal.acteurId, acteurId), eq(journal.action, action)));
}

/** Questions d'un QCM dans l'ordre : identifiant, position, liaison. */
async function ordre(qcmId: string) {
  return db()
    .select({ id: question.id, position: question.position, liee: question.lieeASuivante })
    .from(question)
    .where(eq(question.qcmId, qcmId))
    .orderBy(asc(question.position));
}

async function reponsesDe(questionId: string) {
  return db()
    .select({ texte: proposition.texte, imageId: proposition.imageId, correcte: proposition.correcte })
    .from(proposition)
    .where(eq(proposition.questionId, questionId))
    .orderBy(asc(proposition.position));
}

async function ligne(questionId: string) {
  const [q] = await db().select().from(question).where(eq(question.id, questionId));
  return q;
}

function saisie(questionId: string, modifications: Partial<SaisieQuestion> = {}): SaisieQuestion {
  return {
    questionId,
    type: "unique",
    enonce: "Quelle est la capitale de la France ?",
    imageId: null,
    code: null,
    propositions: [
      { texte: "Paris", imageId: null, correcte: true },
      { texte: "Lyon", imageId: null, correcte: false },
    ],
    pointsBonne: 1,
    pointsMauvaise: -0.25,
    pointsVide: 0,
    dureeS: null,
    ...modifications,
  };
}

/** Saisie volontairement invalide (valeurs hors du type) : ce que pourrait envoyer un client modifié. */
function saisieBrute(questionId: string, modifications: Record<string, unknown>): SaisieQuestion {
  return { ...saisie(questionId), ...modifications } as SaisieQuestion;
}

describe("ajouterQuestion", () => {
  it("ajoute à la fin une question du type et du barème de la dernière, avec deux réponses vides", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    await creerQuestionTest(q.id, { type: "multiple", pointsBonne: 2, pointsMauvaise: -0.5 });
    horloge.avancer(1_000);
    const { id } = await ajouterQuestion(a, { qcmId: q.id });
    expect(await ligne(id)).toMatchObject({
      position: 2,
      type: "multiple",
      enonce: "",
      pointsBonne: 2,
      pointsMauvaise: -0.5,
      pointsVide: 0,
      lieeASuivante: false,
    });
    expect((await reponsesDe(id)).map((r) => r.texte)).toEqual(["", ""]);
    const [apres] = await db().select().from(qcm).where(eq(qcm.id, q.id));
    expect(apres?.modifieLe).toEqual(new Date(DEBUT + 1_000));
  });

  it("pré-remplit « Vrai » et « Faux » après un vrai/faux, et prend les valeurs par défaut dans un QCM vide", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    const premiere = await ajouterQuestion(a, { qcmId: q.id });
    expect(await ligne(premiere.id)).toMatchObject({
      position: 1,
      type: "unique",
      pointsBonne: 1,
      pointsMauvaise: 0,
    });
    await enregistrerQuestion(a, saisie(premiere.id, { type: "vrai_faux" }));
    const seconde = await ajouterQuestion(a, { qcmId: q.id });
    expect((await reponsesDe(seconde.id)).map((r) => r.texte)).toEqual(["Vrai", "Faux"]);
  });

  it("garde des positions contiguës quand trois ajouts arrivent ensemble", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    await creerQuestionTest(q.id);
    await Promise.all([1, 2, 3].map(() => ajouterQuestion(a, { qcmId: q.id })));
    expect((await ordre(q.id)).map((x) => x.position)).toEqual([1, 2, 3, 4]);
  });

  it("refuse une 101e question, même quand deux ajouts arrivent ensemble", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    await db()
      .insert(question)
      .values(Array.from({ length: 99 }, (_, i) => ({ qcmId: q.id, position: i + 1 })));
    const resultats = await Promise.allSettled([
      ajouterQuestion(a, { qcmId: q.id }),
      ajouterQuestion(a, { qcmId: q.id }),
    ]);
    expect(resultats.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultats.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "ETAT", message: MESSAGE_QCM_PLEIN },
    });
    expect(MESSAGE_QCM_PLEIN).toBe("Ce QCM compte déjà 100 questions, le maximum.");
  });

  it.each([
    ["pret", PRET],
    ["archive", ARCHIVE],
  ] as const)("refuse d'ajouter une question à un QCM %s", async (statut, message) => {
    const a = await acteur();
    const q = await creerQcmTest(a.id, { statut });
    await expect(ajouterQuestion(a, { qcmId: q.id })).rejects.toMatchObject({ code: "ETAT", message });
  });
});

describe("enregistrerQuestion", () => {
  it("remplace la question entière et ses réponses, et renvoie l'heure d'enregistrement", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    const qu = await creerQuestionTest(q.id);
    const illustration = await creerImageTest(a.id);
    const graphique = await creerImageTest(a.id);
    horloge.avancer(2_000);
    const resultat = await enregistrerQuestion(
      a,
      saisie(qu.id, {
        type: "multiple",
        enonce: "Qu'affiche ce programme ?",
        imageId: illustration.id,
        code: { langage: "python", source: "print(f(4))" },
        propositions: [
          { texte: "24", imageId: null, correcte: true },
          { texte: "", imageId: graphique.id, correcte: true },
          { texte: "16", imageId: null, correcte: false },
        ],
        pointsBonne: 2,
        dureeS: 45,
      }),
    );
    expect(resultat).toEqual({ modifieLe: new Date(DEBUT + 2_000) });
    expect(await ligne(qu.id)).toMatchObject({
      type: "multiple",
      enonce: "Qu'affiche ce programme ?",
      imageId: illustration.id,
      codeLangage: "python",
      codeSource: "print(f(4))",
      pointsBonne: 2,
      pointsMauvaise: -0.25,
      pointsVide: 0,
      dureeS: 45,
    });
    expect(await reponsesDe(qu.id)).toEqual([
      { texte: "24", imageId: null, correcte: true },
      { texte: "", imageId: graphique.id, correcte: true },
      { texte: "16", imageId: null, correcte: false },
    ]);
  });

  it("accepte une question incomplète (brouillon) et retire le bloc de code", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    const qu = await creerQuestionTest(q.id, { code: { langage: "python", source: "print(1)" } });
    await enregistrerQuestion(a, saisie(qu.id, { enonce: "", propositions: [] }));
    expect(await ligne(qu.id)).toMatchObject({ enonce: "", codeLangage: null, codeSource: null });
    expect(await reponsesDe(qu.id)).toEqual([]);
  });

  it("unifie les retours à la ligne sans rogner le texte", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    const qu = await creerQuestionTest(q.id);
    await enregistrerQuestion(a, saisie(qu.id, { enonce: "Ligne 1\r\nLigne 2 " }));
    expect((await ligne(qu.id))?.enonce).toBe("Ligne 1\nLigne 2 ");
  });

  it.each([
    [{ enonce: "x".repeat(2001) }, "enonce", "L'énoncé dépasse 2000 caractères."],
    [
      { enonce: `Question${String.fromCharCode(7)}` },
      "enonce",
      "L'énoncé contient des caractères non autorisés.",
    ],
    [{ type: "ouverte" }, "type", "Type de question inconnu."],
    [{ code: { langage: "ruby", source: "puts 1" } }, "code.langage", "Langage non pris en charge."],
    [
      { code: { langage: "python", source: "x".repeat(4001) } },
      "code.source",
      "Le code dépasse 4000 caractères.",
    ],
    [
      { propositions: Array.from({ length: 9 }, () => ({ texte: "a", imageId: null, correcte: false })) },
      "propositions",
      "Une question a 8 réponses au plus.",
    ],
    [
      { propositions: [{ texte: "deux\nlignes", imageId: null, correcte: false }] },
      "propositions.0.texte",
      "La réponse contient des caractères non autorisés.",
    ],
    [{ pointsBonne: 0 }, "pointsBonne", "Les points d'une bonne réponse vont de 0,01 à 100."],
    [{ pointsBonne: Number.NaN }, "pointsBonne", MESSAGE_POINTS_NOMBRE],
    [{ pointsMauvaise: 0.5 }, "pointsMauvaise", `Les points d'une mauvaise réponse vont de ${MOINS}100 à 0.`],
    [{ pointsVide: 0.5 }, "pointsVide", `Les points sans réponse vont de ${MOINS}100 à 0.`],
    [{ dureeS: 3 }, "dureeS", MESSAGE_DUREE_QUESTION],
  ])("refuse %o", async (modifications, chemin, message) => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    const qu = await creerQuestionTest(q.id);
    await expect(enregistrerQuestion(a, saisieBrute(qu.id, modifications))).rejects.toMatchObject({
      code: "VALIDATION",
      details: expect.arrayContaining([{ chemin, message }]),
    });
  });

  it("refuse une clé inattendue", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    const qu = await creerQuestionTest(q.id);
    await expect(enregistrerQuestion(a, saisieBrute(qu.id, { correction: "Paris" }))).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("refuse l'image d'un autre compte comme une image inconnue, journalise le refus et ne change rien", async () => {
    const a = await acteur();
    const b = await acteur();
    const q = await creerQcmTest(a.id);
    const qu = await creerQuestionTest(q.id);
    const autre = await creerImageTest(b.id);
    await expect(
      enregistrerQuestion(
        a,
        saisie(qu.id, { propositions: [{ texte: "", imageId: autre.id, correcte: true }] }),
      ),
    ).rejects.toMatchObject({ code: "INTROUVABLE", message: "Image introuvable." });
    const [refus] = await journalDe(a.id, "acces.refus");
    expect(refus?.details).toEqual({
      action: "questions.enregistrer",
      role: "enseignant",
      motif: "ressource_autrui",
    });
    expect((await reponsesDe(qu.id)).map((r) => r.texte)).toEqual(["Oui", "Non"]);
    await expect(enregistrerQuestion(a, saisie(qu.id, { imageId: randomUUID() }))).rejects.toMatchObject({
      code: "INTROUVABLE",
    });
    expect(await journalDe(a.id, "acces.refus")).toHaveLength(1);
  });

  it.each([
    ["pret", PRET],
    ["archive", ARCHIVE],
  ] as const)("refuse d'enregistrer une question d'un QCM %s", async (statut, message) => {
    const a = await acteur();
    const q = await creerQcmTest(a.id, { statut });
    const qu = await creerQuestionTest(q.id);
    await expect(enregistrerQuestion(a, saisie(qu.id))).rejects.toMatchObject({ code: "ETAT", message });
  });

  it("laisse gagner le dernier de deux enregistrements simultanés, sans mélanger leurs réponses", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    const qu = await creerQuestionTest(q.id);
    const deux = saisie(qu.id, { enonce: "Deux" });
    const trois = saisie(qu.id, {
      enonce: "Trois",
      propositions: [
        { texte: "A", imageId: null, correcte: true },
        { texte: "B", imageId: null, correcte: false },
        { texte: "C", imageId: null, correcte: false },
      ],
    });
    await Promise.all([enregistrerQuestion(a, deux), enregistrerQuestion(a, trois)]);
    const enonce = (await ligne(qu.id))?.enonce;
    const textes = (await reponsesDe(qu.id)).map((r) => r.texte);
    expect(enonce === "Deux" ? ["Paris", "Lyon"] : ["A", "B", "C"]).toEqual(textes);
  });
});

describe("supprimerQuestion", () => {
  it("supprime la question, renumérote les autres et désigne une voisine", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    const q1 = await creerQuestionTest(q.id);
    const q2 = await creerQuestionTest(q.id);
    const q3 = await creerQuestionTest(q.id);
    expect(await supprimerQuestion(a, { questionId: q2.id })).toEqual({ qcmId: q.id, voisineId: q3.id });
    expect(await ordre(q.id)).toEqual([
      { id: q1.id, position: 1, liee: false },
      { id: q3.id, position: 2, liee: false },
    ]);
    expect(await supprimerQuestion(a, { questionId: q3.id })).toEqual({ qcmId: q.id, voisineId: q1.id });
    expect(await supprimerQuestion(a, { questionId: q1.id })).toEqual({ qcmId: q.id, voisineId: null });
  });

  it("délie la précédente quand la question supprimée terminait la chaîne", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    const q1 = await creerQuestionTest(q.id, { lieeASuivante: true });
    const q2 = await creerQuestionTest(q.id);
    const q3 = await creerQuestionTest(q.id);
    await supprimerQuestion(a, { questionId: q2.id });
    expect(await ordre(q.id)).toEqual([
      { id: q1.id, position: 1, liee: false },
      { id: q3.id, position: 2, liee: false },
    ]);
  });

  it("garde la chaîne quand la question supprimée était au milieu", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    const q1 = await creerQuestionTest(q.id, { lieeASuivante: true });
    const q2 = await creerQuestionTest(q.id, { lieeASuivante: true });
    const q3 = await creerQuestionTest(q.id);
    await supprimerQuestion(a, { questionId: q2.id });
    expect(await ordre(q.id)).toEqual([
      { id: q1.id, position: 1, liee: true },
      { id: q3.id, position: 2, liee: false },
    ]);
  });

  it("refuse de supprimer une question d'un QCM prêt", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id, { statut: "pret" });
    const qu = await creerQuestionTest(q.id);
    await expect(supprimerQuestion(a, { questionId: qu.id })).rejects.toMatchObject({
      code: "ETAT",
      message: PRET,
    });
  });
});

describe("deplacerQuestion", () => {
  it("échange une question seule avec sa voisine", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    const q1 = await creerQuestionTest(q.id);
    const q2 = await creerQuestionTest(q.id);
    const q3 = await creerQuestionTest(q.id);
    await deplacerQuestion(a, { questionId: q3.id, sens: "haut" });
    expect((await ordre(q.id)).map((x) => x.id)).toEqual([q1.id, q3.id, q2.id]);
    await deplacerQuestion(a, { questionId: q1.id, sens: "bas" });
    expect((await ordre(q.id)).map((x) => x.id)).toEqual([q3.id, q1.id, q2.id]);
  });

  it("déplace le bloc entier d'une question liée, liaisons gardées", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    const q1 = await creerQuestionTest(q.id);
    const q2 = await creerQuestionTest(q.id, { lieeASuivante: true });
    const q3 = await creerQuestionTest(q.id);
    const q4 = await creerQuestionTest(q.id);
    await deplacerQuestion(a, { questionId: q3.id, sens: "haut" });
    expect(await ordre(q.id)).toEqual([
      { id: q2.id, position: 1, liee: true },
      { id: q3.id, position: 2, liee: false },
      { id: q1.id, position: 3, liee: false },
      { id: q4.id, position: 4, liee: false },
    ]);
    await deplacerQuestion(a, { questionId: q2.id, sens: "bas" });
    expect((await ordre(q.id)).map((x) => x.id)).toEqual([q1.id, q2.id, q3.id, q4.id]);
  });

  it("refuse de monter le premier bloc ou de descendre le dernier", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    const q1 = await creerQuestionTest(q.id, { lieeASuivante: true });
    const q2 = await creerQuestionTest(q.id);
    await expect(deplacerQuestion(a, { questionId: q2.id, sens: "haut" })).rejects.toMatchObject({
      code: "ETAT",
      message: "Cette question est déjà en tête du QCM.",
    });
    await expect(deplacerQuestion(a, { questionId: q1.id, sens: "bas" })).rejects.toMatchObject({
      code: "ETAT",
      message: "Cette question est déjà à la fin du QCM.",
    });
  });

  it("garde des positions contiguës quand déplacements et suppression arrivent ensemble", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    const questions = [];
    for (let i = 0; i < 6; i++) questions.push(await creerQuestionTest(q.id));
    const [q1, q2, , q4, , q6] = questions;
    if (!q1 || !q2 || !q4 || !q6) throw new Error("questions absentes");
    await Promise.allSettled([
      deplacerQuestion(a, { questionId: q6.id, sens: "haut" }),
      deplacerQuestion(a, { questionId: q1.id, sens: "bas" }),
      supprimerQuestion(a, { questionId: q4.id }),
      deplacerQuestion(a, { questionId: q2.id, sens: "bas" }),
    ]);
    expect((await ordre(q.id)).map((x) => x.position)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("lierQuestion", () => {
  it("lie une question à la suivante puis la délie, sans erreur si rien ne change", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    const q1 = await creerQuestionTest(q.id);
    await creerQuestionTest(q.id);
    await lierQuestion(a, { questionId: q1.id, lieeASuivante: true });
    expect((await ligne(q1.id))?.lieeASuivante).toBe(true);
    await lierQuestion(a, { questionId: q1.id, lieeASuivante: true });
    await lierQuestion(a, { questionId: q1.id, lieeASuivante: false });
    expect((await ligne(q1.id))?.lieeASuivante).toBe(false);
  });

  it("refuse de lier la dernière question à la suivante", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    await creerQuestionTest(q.id);
    const derniere = await creerQuestionTest(q.id);
    await expect(lierQuestion(a, { questionId: derniere.id, lieeASuivante: true })).rejects.toMatchObject({
      code: "ETAT",
      message: "La dernière question ne peut pas être liée à la suivante.",
    });
  });

  it("refuse de lier les questions d'un QCM archivé", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id, { statut: "archive" });
    const q1 = await creerQuestionTest(q.id);
    await creerQuestionTest(q.id);
    await expect(lierQuestion(a, { questionId: q1.id, lieeASuivante: true })).rejects.toMatchObject({
      code: "ETAT",
      message: ARCHIVE,
    });
  });
});

describe("refus d'autrui", () => {
  const services: [
    string,
    (acteur: ActeurUtilisateur, qcmId: string, questionId: string) => Promise<unknown>,
    string,
  ][] = [
    ["questions.ajouter", (x, qcmId) => ajouterQuestion(x, { qcmId }), "QCM introuvable."],
    [
      "questions.enregistrer",
      (x, _q, questionId) => enregistrerQuestion(x, saisie(questionId)),
      "Question introuvable.",
    ],
    [
      "questions.supprimer",
      (x, _q, questionId) => supprimerQuestion(x, { questionId }),
      "Question introuvable.",
    ],
    [
      "questions.deplacer",
      (x, _q, questionId) => deplacerQuestion(x, { questionId, sens: "bas" }),
      "Question introuvable.",
    ],
    [
      "questions.lier",
      (x, _q, questionId) => lierQuestion(x, { questionId, lieeASuivante: true }),
      "Question introuvable.",
    ],
  ];

  it.each(services)(
    "%s : la ressource d'un autre compte répond « introuvable » et le refus est journalisé",
    async (action, service, message) => {
      const proprietaire = await acteur();
      const intrus = await acteur("admin");
      const q = await creerQcmTest(proprietaire.id);
      const qu = await creerQuestionTest(q.id);
      await creerQuestionTest(q.id);
      await expect(service(intrus, q.id, qu.id)).rejects.toMatchObject({ code: "INTROUVABLE", message });
      const [refus] = await journalDe(intrus.id, "acces.refus");
      expect(refus?.details).toEqual({ action, role: "admin", motif: "ressource_autrui" });
      expect(await ordre(q.id)).toHaveLength(2);
    },
  );

  it("répond « introuvable » sans journal pour un identifiant mal formé", async () => {
    const a = await acteur();
    await expect(supprimerQuestion(a, { questionId: "1 OR 1=1" })).rejects.toMatchObject({
      code: "INTROUVABLE",
      message: "Question introuvable.",
    });
    expect(await journalDe(a.id, "acces.refus")).toEqual([]);
  });
});
