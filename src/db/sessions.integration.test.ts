import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  classe,
  demandeAppareil,
  etudiant,
  evenement,
  participation,
  qcm,
  reponse,
  sessionExamen,
  utilisateur,
} from "@/db/schema";

const INSTANT = new Date("2026-09-29T08:00:00.000Z");

/** SQLSTATE de l'erreur levée par `action` (cherché dans les causes), ou undefined si rien n'est levé. */
async function codeSql(action: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await action();
    return undefined;
  } catch (erreur) {
    let courant: unknown = erreur;
    while (typeof courant === "object" && courant !== null) {
      const code = (courant as { code?: unknown }).code;
      if (typeof code === "string") return code;
      courant = (courant as { cause?: unknown }).cause;
    }
    return "inconnu";
  }
}

let compteur = 0;

function suivant(): number {
  compteur += 1;
  return compteur;
}

/** Enseignant, classe de deux étudiants, QCM prêt et session en salle d'attente. */
async function sessionEtEtudiants() {
  const n = suivant();
  const [u] = await db()
    .insert(utilisateur)
    .values({
      email: `sessions${n}@exemple.fr`,
      nom: "Arnaud",
      prenom: "Claire",
      role: "enseignant",
      motDePasseHash: "h",
      creeLe: INSTANT,
    })
    .returning();
  if (!u) throw new Error("utilisateur non créé");
  const [c] = await db()
    .insert(classe)
    .values({ enseignantId: u.id, nom: `TD${n}`, creeLe: INSTANT })
    .returning();
  if (!c) throw new Error("classe non créée");
  const etudiants = await db()
    .insert(etudiant)
    .values([
      {
        classeId: c.id,
        nom: "Dupont",
        prenom: "Léa",
        nomNormalise: "dupont",
        prenomNormalise: "lea",
        creeLe: INSTANT,
      },
      {
        classeId: c.id,
        nom: "Dupuis",
        prenom: "Hugo",
        nomNormalise: "dupuis",
        prenomNormalise: "hugo",
        creeLe: INSTANT,
      },
    ])
    .returning();
  const [lea, hugo] = etudiants;
  if (!lea || !hugo) throw new Error("étudiants non créés");
  const [q] = await db()
    .insert(qcm)
    .values({
      enseignantId: u.id,
      titre: "Algorithmique",
      statut: "pret",
      creeLe: INSTANT,
      modifieLe: INSTANT,
    })
    .returning();
  if (!q) throw new Error("qcm non créé");
  const [s] = await db()
    .insert(sessionExamen)
    .values({
      qcmId: q.id,
      classeId: c.id,
      enseignantId: u.id,
      codeSecret: "secret",
      noteVisible: true,
      correctionVisible: false,
      creeLe: INSTANT,
    })
    .returning();
  if (!s) throw new Error("session non créée");
  return { u, c, q, s, lea, hugo };
}

async function nouvelleParticipation(sessionId: string, etudiantId: string, hash = `appareil${suivant()}`) {
  const [p] = await db()
    .insert(participation)
    .values({
      sessionId,
      etudiantId,
      appareilJetonHash: hash,
      rejointeLe: INSTANT,
      dernierContactLe: INSTANT,
    })
    .returning();
  if (!p) throw new Error("participation non créée");
  return p;
}

async function nouvelleDemande(
  participationId: string,
  valeurs: Partial<typeof demandeAppareil.$inferInsert> = {},
) {
  const [d] = await db()
    .insert(demandeAppareil)
    .values({
      participationId,
      motif: "second_appareil",
      jetonHash: `demande${suivant()}`,
      creeLe: INSTANT,
      ...valeurs,
    })
    .returning();
  if (!d) throw new Error("demande non créée");
  return d;
}

describe("tables des sessions", () => {
  it("crée une session en salle d'attente et une participation en attente", async () => {
    const { s, lea } = await sessionEtEtudiants();
    expect(s).toMatchObject({ statut: "attente", demarreLe: null, termineLe: null, creneauPrevuLe: null });
    const p = await nouvelleParticipation(s.id, lea.id);
    expect(p).toMatchObject({ statut: "attente", informationLueLe: null });
  });

  it("refuse deux participations du même étudiant à une session", async () => {
    const { s, lea } = await sessionEtEtudiants();
    await nouvelleParticipation(s.id, lea.id);
    expect(await codeSql(() => nouvelleParticipation(s.id, lea.id))).toBe("23505");
  });

  it("refuse deux participations avec la même empreinte d'appareil", async () => {
    const { s, lea, hugo } = await sessionEtEtudiants();
    await nouvelleParticipation(s.id, lea.id, "meme-empreinte");
    expect(await codeSql(() => nouvelleParticipation(s.id, hugo.id, "meme-empreinte"))).toBe("23505");
  });

  it("n'accepte qu'une demande en attente par participation", async () => {
    const { s, lea } = await sessionEtEtudiants();
    const p = await nouvelleParticipation(s.id, lea.id);
    await nouvelleDemande(p.id, { statut: "refusee" });
    const d = await nouvelleDemande(p.id);
    expect(d.statut).toBe("en_attente");
    expect(await codeSql(() => nouvelleDemande(p.id))).toBe("23505");
  });

  it("refuse de supprimer un étudiant qui a participé", async () => {
    const { s, lea, hugo } = await sessionEtEtudiants();
    await nouvelleParticipation(s.id, lea.id);
    expect(await codeSql(() => db().delete(etudiant).where(eq(etudiant.id, lea.id)))).toBe("23503");
    expect(await codeSql(() => db().delete(etudiant).where(eq(etudiant.id, hugo.id)))).toBeUndefined();
  });

  it("refuse de supprimer le QCM ou la classe d'une session", async () => {
    const { q, c } = await sessionEtEtudiants();
    expect(await codeSql(() => db().delete(qcm).where(eq(qcm.id, q.id)))).toBe("23503");
    expect(await codeSql(() => db().delete(classe).where(eq(classe.id, c.id)))).toBe("23503");
  });

  it("supprime participations, demandes et événements avec leur session", async () => {
    const { s, lea } = await sessionEtEtudiants();
    const p = await nouvelleParticipation(s.id, lea.id);
    await nouvelleDemande(p.id);
    await db().insert(evenement).values({ participationId: p.id, type: "second_appareil", recuLe: INSTANT });
    await db().delete(sessionExamen).where(eq(sessionExamen.id, s.id));
    expect(await db().select().from(participation).where(eq(participation.sessionId, s.id))).toEqual([]);
    expect(
      await db().select().from(demandeAppareil).where(eq(demandeAppareil.participationId, p.id)),
    ).toEqual([]);
    expect(await db().select().from(evenement).where(eq(evenement.participationId, p.id))).toEqual([]);
  });

  it("numérote les événements et leur donne des détails vides par défaut", async () => {
    const { s, lea } = await sessionEtEtudiants();
    const p = await nouvelleParticipation(s.id, lea.id);
    const [e] = await db()
      .insert(evenement)
      .values({ participationId: p.id, type: "second_appareil", recuLe: INSTANT })
      .returning();
    expect(typeof e?.id).toBe("number");
    expect(e).toMatchObject({ details: {}, dureeMs: null, questionIndex: null });
  });

  it("donne à une participation un passage vierge par défaut", async () => {
    const { s, lea } = await sessionEtEtudiants();
    const p = await nouvelleParticipation(s.id, lea.id);
    expect(p).toMatchObject({
      tiersTemps: false,
      ordre: null,
      indexCourant: 0,
      questionServieLe: null,
      echeanceQuestionLe: null,
      echeanceGlobaleLe: null,
      termineeLe: null,
      points: null,
      noteSur20: null,
    });
    expect(s).toMatchObject({ contenu: null, finPrevueLe: null });
  });

  it("n'accepte qu'une réponse par question et par participation", async () => {
    const { s, lea } = await sessionEtEtudiants();
    const p = await nouvelleParticipation(s.id, lea.id);
    await db()
      .insert(reponse)
      .values({ participationId: p.id, questionCle: "q", selectionBrouillon: [1] });
    expect(
      await codeSql(() =>
        db()
          .insert(reponse)
          .values({ participationId: p.id, questionCle: "q", selectionBrouillon: [0] }),
      ),
    ).toBe("23505");
  });

  it("refuse une validation incomplète", async () => {
    const { s, lea } = await sessionEtEtudiants();
    const p = await nouvelleParticipation(s.id, lea.id);
    expect(
      await codeSql(() =>
        db().insert(reponse).values({ participationId: p.id, questionCle: "q", valideeLe: INSTANT }),
      ),
    ).toBe("23514");
    expect(
      await codeSql(() =>
        db()
          .insert(reponse)
          .values({
            participationId: p.id,
            questionCle: "q",
            selection: [0],
            valideeLe: INSTANT,
            origine: "validation",
            points: 1,
          }),
      ),
    ).toBeUndefined();
  });

  it("supprime les réponses avec leur participation", async () => {
    const { s, lea } = await sessionEtEtudiants();
    const p = await nouvelleParticipation(s.id, lea.id);
    await db().insert(reponse).values({ participationId: p.id, questionCle: "q", selectionBrouillon: [] });
    await db().delete(participation).where(eq(participation.id, p.id));
    expect(await db().select().from(reponse).where(eq(reponse.participationId, p.id))).toEqual([]);
  });
});
