import type { ImageVue } from "@/lib/images";
import { libellePoints } from "@/lib/points";
import { LIBELLES_TYPE, type StatutQcm, type TypeQuestion } from "@/lib/regles-qcm";
import { pluriel } from "@/lib/textes";

/** Couleur de l'étiquette de statut (maquette « Accueil », tableau « Mes QCM »). */
export const TONS_STATUT: Record<StatutQcm, "sombre" | "bleu" | "neutre"> = {
  brouillon: "neutre",
  pret: "bleu",
  archive: "neutre",
};

/** « 1 question », « 20 questions ». */
export function libelleQuestions(n: number): string {
  return pluriel(n, "question", "questions");
}

/** Titre d'une question dans la liste : première ligne non vide de l'énoncé, coupée à 80 caractères. */
export function titreQuestion(enonce: string): string {
  const premiere =
    enonce
      .split("\n")
      .map((ligne) => ligne.trim())
      .find((ligne) => ligne !== "") ?? "";
  if (premiere === "") return "Question sans énoncé";
  // Par points de code : un émoji (deux unités UTF-16) n'est jamais coupé en deux.
  const caracteres = Array.from(premiere);
  return caracteres.length > 80 ? `${caracteres.slice(0, 79).join("")}…` : premiere;
}

/** « Choix unique · 1 pt · code · image » (maquette « Éditeur de QCM », liste des questions). */
export function metaQuestion(question: {
  type: TypeQuestion;
  pointsBonne: number;
  code: unknown;
  image: ImageVue | null;
  propositions: { image: ImageVue | null }[];
}): string {
  const parties = [LIBELLES_TYPE[question.type], libellePoints(question.pointsBonne)];
  if (question.code) parties.push("code");
  if (question.image || question.propositions.some((p) => p.image)) parties.push("image");
  return parties.join(" · ");
}
