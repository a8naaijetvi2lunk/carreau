/** Données de test des QCM (base isolée) : insertion directe, questions complètes par défaut. */
import { eq, max } from "drizzle-orm";
import { db } from "@/db";
import { proposition, qcm, question } from "@/db/schema";
import { maintenant } from "@/lib/horloge";
import type { LangageCode, ModeChrono, OrigineQcm, StatutQcm, TypeQuestion } from "@/lib/regles-qcm";
import { exiger } from "./comptes";

let compteur = 0;

export async function creerQcmTest(
  enseignantId: string,
  options: {
    titre?: string;
    statut?: StatutQcm;
    origine?: OrigineQcm;
    modeChrono?: ModeChrono;
    dureeGlobaleS?: number | null;
    dureeQuestionS?: number | null;
  } = {},
) {
  compteur += 1;
  const [cree] = await db()
    .insert(qcm)
    .values({
      enseignantId,
      titre: options.titre ?? `QCM ${compteur}`,
      statut: options.statut ?? "brouillon",
      origine: options.origine ?? "interface",
      modeChrono: options.modeChrono ?? "aucun",
      dureeGlobaleS: options.dureeGlobaleS ?? null,
      dureeQuestionS: options.dureeQuestionS ?? null,
      creeLe: maintenant(),
      modifieLe: maintenant(),
    })
    .returning();
  return exiger(cree, "qcm");
}

export type PropositionTest = { texte?: string; imageId?: string | null; correcte?: boolean };

/** Question ajoutée à la fin du QCM ; complète par défaut (énoncé, « Oui » juste, « Non » faux). */
export async function creerQuestionTest(
  qcmId: string,
  options: {
    type?: TypeQuestion;
    enonce?: string;
    imageId?: string | null;
    code?: { langage: LangageCode; source: string } | null;
    propositions?: PropositionTest[];
    pointsBonne?: number;
    pointsMauvaise?: number;
    pointsVide?: number;
    dureeS?: number | null;
    lieeASuivante?: boolean;
  } = {},
) {
  const [derniere] = await db()
    .select({ position: max(question.position) })
    .from(question)
    .where(eq(question.qcmId, qcmId));
  const position = (derniere?.position ?? 0) + 1;
  const [creee] = await db()
    .insert(question)
    .values({
      qcmId,
      position,
      type: options.type ?? "unique",
      enonce: options.enonce ?? `Question ${position}`,
      imageId: options.imageId ?? null,
      codeLangage: options.code?.langage ?? null,
      codeSource: options.code?.source ?? null,
      pointsBonne: options.pointsBonne ?? 1,
      pointsMauvaise: options.pointsMauvaise ?? 0,
      pointsVide: options.pointsVide ?? 0,
      dureeS: options.dureeS ?? null,
      lieeASuivante: options.lieeASuivante ?? false,
    })
    .returning();
  const q = exiger(creee, "question");
  const propositions = options.propositions ?? [
    { texte: "Oui", correcte: true },
    { texte: "Non", correcte: false },
  ];
  if (propositions.length > 0) {
    await db()
      .insert(proposition)
      .values(
        propositions.map((p, index) => ({
          questionId: q.id,
          position: index + 1,
          texte: p.texte ?? "",
          imageId: p.imageId ?? null,
          correcte: p.correcte ?? false,
        })),
      );
  }
  return q;
}
