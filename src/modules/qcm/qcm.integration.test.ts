import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { journal, proposition, qcm, question } from "@/db/schema";
import type { ActeurUtilisateur, Role } from "@/lib/acteur";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { LIMITES_QCM, MESSAGE_DUREE_GLOBALE, MESSAGE_DUREE_QUESTION } from "@/lib/regles-qcm";
import {
  archiverQcm,
  creerQcm,
  lireQcm,
  listerQcm,
  marquerPret,
  MESSAGE_LIMITE_QCM,
  modifierParametres,
  repasserEnBrouillon,
  restaurerQcm,
  type SaisieParametres,
} from "@/modules/qcm";
import { acteurDe, creerUtilisateur } from "@/test/comptes";
import { creerImageTest } from "@/test/images";
import { creerQcmTest, creerQuestionTest } from "@/test/qcm";

const DEBUT = Date.parse("2026-09-29T08:00:00.000Z");
const horloge = horlogeFixe(DEBUT);
const PRET = "Ce QCM est prêt : repasse-le en brouillon pour le modifier.";
const ARCHIVE = "Ce QCM est archivé : restaure-le pour le modifier.";

beforeEach(() => {
  horloge.fixer(DEBUT);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

async function acteur(role: Role = "enseignant"): Promise<ActeurUtilisateur> {
  return acteurDe(await creerUtilisateur({ role }));
}

async function journalDe(acteurId: string, action: string) {
  return db()
    .select()
    .from(journal)
    .where(and(eq(journal.acteurId, acteurId), eq(journal.action, action)));
}

async function lu(qcmId: string) {
  const [ligne] = await db().select().from(qcm).where(eq(qcm.id, qcmId));
  return ligne;
}

function parametres(qcmId: string, modifications: Partial<SaisieParametres> = {}): SaisieParametres {
  return {
    qcmId,
    titre: "Algorithmique — Contrôle 2",
    modeChrono: "global",
    dureeGlobaleMinutes: 20,
    dureeQuestionS: null,
    noteVisibleDefaut: true,
    correctionVisibleDefaut: false,
    ...modifications,
  };
}

/** `n` QCM du compte, insérés d'un coup. */
async function remplir(enseignantId: string, n: number): Promise<void> {
  const le = new Date(DEBUT);
  await db()
    .insert(qcm)
    .values(
      Array.from({ length: n }, (_, i) => ({ enseignantId, titre: `QCM ${i}`, creeLe: le, modifieLe: le })),
    );
}

describe("creerQcm", () => {
  it("crée un brouillon avec sa question 1 et deux réponses vides, journalisé sans le titre", async () => {
    const a = await acteur();
    const { id, questionId } = await creerQcm(a, { titre: "  Algorithmique   —  Contrôle 2 " });
    expect(await lu(id)).toMatchObject({
      enseignantId: a.id,
      titre: "Algorithmique — Contrôle 2",
      statut: "brouillon",
      origine: "interface",
      modeChrono: "aucun",
      modifieLe: new Date(DEBUT),
    });
    const questions = await db().select().from(question).where(eq(question.qcmId, id));
    expect(questions).toEqual([
      expect.objectContaining({ id: questionId, position: 1, type: "unique", enonce: "" }),
    ]);
    const reponses = await db()
      .select()
      .from(proposition)
      .where(eq(proposition.questionId, questionId))
      .orderBy(asc(proposition.position));
    expect(reponses.map((r) => [r.position, r.texte, r.correcte])).toEqual([
      [1, "", false],
      [2, "", false],
    ]);
    const [entree] = await journalDe(a.id, "qcm.creer");
    expect(entree).toMatchObject({ cible: `qcm:${id}`, details: {} });
  });

  it.each(["admin", "super_admin"] as const)("un compte %s a aussi ses QCM", async (role) => {
    await expect(creerQcm(await acteur(role), { titre: "Réseaux" })).resolves.toHaveProperty("id");
  });

  it.each([
    ["", "Le titre est obligatoire."],
    ["   ", "Le titre est obligatoire."],
    ["x".repeat(LIMITES_QCM.titreMax + 1), "Le titre dépasse 120 caractères."],
    [`QCM${String.fromCharCode(7)}`, "Le titre contient des caractères non autorisés."],
  ])("refuse le titre « %s »", async (titre, message) => {
    await expect(creerQcm(await acteur(), { titre })).rejects.toMatchObject({
      code: "VALIDATION",
      details: [{ chemin: "titre", message }],
    });
  });

  it(`refuse un ${LIMITES_QCM.qcmParCompte + 1}e QCM, même quand deux créations arrivent ensemble`, async () => {
    const a = await acteur();
    await remplir(a.id, LIMITES_QCM.qcmParCompte - 1);
    const resultats = await Promise.allSettled([creerQcm(a, { titre: "A" }), creerQcm(a, { titre: "B" })]);
    expect(resultats.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultats.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "ETAT", message: MESSAGE_LIMITE_QCM },
    });
    await expect(creerQcm(a, { titre: "C" })).rejects.toMatchObject({ code: "ETAT" });
  });
});

describe("listerQcm", () => {
  it("liste les seuls QCM de l'acteur, du plus récemment modifié au plus ancien, avec leur nombre de questions", async () => {
    const a = await acteur();
    const b = await acteur();
    const ancien = await creerQcmTest(a.id, { titre: "Ancien" });
    await creerQuestionTest(ancien.id);
    await creerQuestionTest(ancien.id);
    horloge.avancer(60_000);
    const recent = await creerQcmTest(a.id, { titre: "Récent", statut: "pret" });
    await creerQcmTest(b.id, { titre: "D'un autre" });
    expect(await listerQcm(a)).toEqual([
      {
        id: recent.id,
        titre: "Récent",
        statut: "pret",
        origine: "interface",
        nombreQuestions: 0,
        modifieLe: new Date(DEBUT + 60_000),
      },
      {
        id: ancien.id,
        titre: "Ancien",
        statut: "brouillon",
        origine: "interface",
        nombreQuestions: 2,
        modifieLe: new Date(DEBUT),
      },
    ]);
  });
});

describe("lireQcm", () => {
  it("rend les paramètres, les questions dans l'ordre et ce qui manque pour passer en « prêt »", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id, { modeChrono: "global" });
    const illustration = await creerImageTest(a.id, { largeur: 800, hauteur: 600 });
    const q1 = await creerQuestionTest(q.id, {
      enonce: "Qu'affiche ce programme ?",
      imageId: illustration.id,
      code: { langage: "python", source: "print(4)" },
      pointsMauvaise: -0.25,
      lieeASuivante: true,
    });
    const q2 = await creerQuestionTest(q.id, { enonce: "" });
    const edite = await lireQcm(a, { qcmId: q.id });
    expect(edite).toMatchObject({ id: q.id, statut: "brouillon", modeChrono: "global", dureeGlobaleS: null });
    expect(edite.questions).toEqual([
      {
        id: q1.id,
        position: 1,
        type: "unique",
        enonce: "Qu'affiche ce programme ?",
        image: { id: illustration.id, largeur: 800, hauteur: 600 },
        code: { langage: "python", source: "print(4)" },
        propositions: [
          { texte: "Oui", image: null, correcte: true },
          { texte: "Non", image: null, correcte: false },
        ],
        pointsBonne: 1,
        pointsMauvaise: -0.25,
        pointsVide: 0,
        dureeS: null,
        lieeASuivante: true,
        problemes: [],
      },
      expect.objectContaining({ id: q2.id, position: 2, problemes: ["L'énoncé est vide."] }),
    ]);
    expect(edite.problemes).toEqual([
      "Indique la durée de l'examen (onglet Paramètres).",
      "Question 2 : L'énoncé est vide.",
    ]);
  });

  it("répond « introuvable » sans journal pour un identifiant mal formé ou inconnu", async () => {
    const a = await acteur();
    await expect(lireQcm(a, { qcmId: "pas-un-uuid" })).rejects.toMatchObject({ code: "INTROUVABLE" });
    await expect(lireQcm(a, { qcmId: randomUUID() })).rejects.toMatchObject({
      code: "INTROUVABLE",
      message: "QCM introuvable.",
    });
    expect(await journalDe(a.id, "acces.refus")).toEqual([]);
  });
});

describe("modifierParametres", () => {
  it("enregistre le titre nettoyé, le chrono (minutes → secondes) et la visibilité par défaut", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    horloge.avancer(5_000);
    await modifierParametres(
      a,
      parametres(q.id, { titre: "  Réseaux  ", dureeQuestionS: 45, correctionVisibleDefaut: true }),
    );
    expect(await lu(q.id)).toMatchObject({
      titre: "Réseaux",
      modeChrono: "global",
      dureeGlobaleS: 1200,
      dureeQuestionS: 45,
      noteVisibleDefaut: true,
      correctionVisibleDefaut: true,
      modifieLe: new Date(DEBUT + 5_000),
    });
  });

  it("garde les durées saisies quand le mode de chrono change", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    await modifierParametres(a, parametres(q.id, { modeChrono: "aucun", dureeGlobaleMinutes: 30 }));
    expect(await lu(q.id)).toMatchObject({ modeChrono: "aucun", dureeGlobaleS: 1800 });
  });

  it.each([
    [{ titre: "" }, "titre", "Le titre est obligatoire."],
    [{ modeChrono: "libre" }, "modeChrono", "Mode de chrono inconnu."],
    [{ dureeGlobaleMinutes: 0 }, "dureeGlobaleMinutes", MESSAGE_DUREE_GLOBALE],
    [{ dureeGlobaleMinutes: Number.NaN }, "dureeGlobaleMinutes", MESSAGE_DUREE_GLOBALE],
    [{ dureeQuestionS: 2 }, "dureeQuestionS", MESSAGE_DUREE_QUESTION],
    [{ dureeQuestionS: 12.5 }, "dureeQuestionS", MESSAGE_DUREE_QUESTION],
  ] as const)("refuse %o", async (modifications, chemin, message) => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    await expect(modifierParametres(a, parametres(q.id, modifications))).rejects.toMatchObject({
      code: "VALIDATION",
      details: [{ chemin, message }],
    });
  });

  it.each([
    ["pret", PRET],
    ["archive", ARCHIVE],
  ] as const)("refuse de modifier un QCM %s", async (statut, message) => {
    const a = await acteur();
    const q = await creerQcmTest(a.id, { statut });
    await expect(modifierParametres(a, parametres(q.id))).rejects.toMatchObject({ code: "ETAT", message });
  });
});

describe("marquerPret", () => {
  it("refuse en listant ce qui manque, sans changer le statut", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    await creerQuestionTest(q.id);
    await creerQuestionTest(q.id, { propositions: [{ texte: "Oui" }, { texte: "Non" }] });
    await expect(marquerPret(a, { qcmId: q.id })).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Ce QCM ne peut pas encore passer en « prêt » : 1 point à corriger.",
      details: { problemes: ["Question 2 : Coche la bonne réponse."] },
    });
    expect((await lu(q.id))?.statut).toBe("brouillon");
  });

  it("refuse un QCM sans question", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id);
    await expect(marquerPret(a, { qcmId: q.id })).rejects.toMatchObject({
      details: { problemes: ["Ajoute au moins une question."] },
    });
  });

  it("fait passer en « prêt » un QCM de 20 questions complètes, et le journalise", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id, { modeChrono: "global", dureeGlobaleS: 1200 });
    for (let i = 0; i < 20; i++) await creerQuestionTest(q.id);
    horloge.avancer(1_000);
    await marquerPret(a, { qcmId: q.id });
    expect(await lu(q.id)).toMatchObject({ statut: "pret", modifieLe: new Date(DEBUT + 1_000) });
    const [entree] = await journalDe(a.id, "qcm.marquer_pret");
    expect(entree).toMatchObject({ cible: `qcm:${q.id}` });
  });

  it.each([
    ["pret", "Ce QCM est déjà prêt."],
    ["archive", ARCHIVE],
  ] as const)("refuse un QCM %s", async (statut, message) => {
    const a = await acteur();
    const q = await creerQcmTest(a.id, { statut });
    await creerQuestionTest(q.id);
    await expect(marquerPret(a, { qcmId: q.id })).rejects.toMatchObject({ code: "ETAT", message });
  });
});

describe("repasserEnBrouillon, archiverQcm, restaurerQcm", () => {
  it("repasse un QCM prêt en brouillon, et le journalise", async () => {
    const a = await acteur();
    const q = await creerQcmTest(a.id, { statut: "pret" });
    await repasserEnBrouillon(a, { qcmId: q.id });
    expect((await lu(q.id))?.statut).toBe("brouillon");
    expect(await journalDe(a.id, "qcm.repasser_brouillon")).toHaveLength(1);
  });

  it.each([
    ["brouillon", "Ce QCM est déjà en brouillon."],
    ["archive", ARCHIVE],
  ] as const)("refuse de repasser en brouillon un QCM %s", async (statut, message) => {
    const a = await acteur();
    const q = await creerQcmTest(a.id, { statut });
    await expect(repasserEnBrouillon(a, { qcmId: q.id })).rejects.toMatchObject({ code: "ETAT", message });
  });

  it.each(["brouillon", "pret"] as const)(
    "archive un QCM %s, puis le restaure en brouillon",
    async (statut) => {
      const a = await acteur();
      const q = await creerQcmTest(a.id, { statut });
      await archiverQcm(a, { qcmId: q.id });
      expect((await lu(q.id))?.statut).toBe("archive");
      await expect(archiverQcm(a, { qcmId: q.id })).rejects.toMatchObject({
        code: "ETAT",
        message: "Ce QCM est déjà archivé.",
      });
      await restaurerQcm(a, { qcmId: q.id });
      expect((await lu(q.id))?.statut).toBe("brouillon");
      await expect(restaurerQcm(a, { qcmId: q.id })).rejects.toMatchObject({
        code: "ETAT",
        message: "Ce QCM n'est pas archivé.",
      });
      expect(await journalDe(a.id, "qcm.archiver")).toHaveLength(1);
      expect(await journalDe(a.id, "qcm.restaurer")).toHaveLength(1);
    },
  );
});

describe("refus d'autrui", () => {
  const services: [string, (acteur: ActeurUtilisateur, qcmId: string) => Promise<unknown>][] = [
    ["qcm.lire", (x, qcmId) => lireQcm(x, { qcmId })],
    ["qcm.modifier_parametres", (x, qcmId) => modifierParametres(x, parametres(qcmId))],
    ["qcm.marquer_pret", (x, qcmId) => marquerPret(x, { qcmId })],
    ["qcm.repasser_brouillon", (x, qcmId) => repasserEnBrouillon(x, { qcmId })],
    ["qcm.archiver", (x, qcmId) => archiverQcm(x, { qcmId })],
    ["qcm.restaurer", (x, qcmId) => restaurerQcm(x, { qcmId })],
  ];

  it.each(services)(
    "%s : le QCM d'un autre compte répond « introuvable » et le refus est journalisé",
    async (action, service) => {
      const proprietaire = await acteur();
      const intrus = await acteur("super_admin");
      const q = await creerQcmTest(proprietaire.id);
      await expect(service(intrus, q.id)).rejects.toMatchObject({
        code: "INTROUVABLE",
        message: "QCM introuvable.",
      });
      const [refus] = await journalDe(intrus.id, "acces.refus");
      expect(refus?.details).toEqual({ action, role: "super_admin", motif: "ressource_autrui" });
      expect((await lu(q.id))?.statut).toBe("brouillon");
    },
  );
});
