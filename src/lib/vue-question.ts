import type { TypeQuestion } from "./regles-qcm";

/** Jeton de code coloré côté serveur (shiki) : du texte et une couleur, jamais du HTML. */
export type JetonCode = { texte: string; couleur: string };

export type ImageAffichee = { url: string; largeur: number; hauteur: number };

/**
 * Question telle que la voit l'étudiant (aperçu au lot 3, examen au lot 5). Ne contient jamais
 * l'indicateur de bonne réponse (spec §6.4 et §11.1).
 */
export type VueQuestion = {
  rang: number;
  total: number;
  type: TypeQuestion;
  enonce: string;
  image: ImageAffichee | null;
  code: { libelle: string; lignes: JetonCode[][] } | null;
  propositions: { id: string; texte: string; image: ImageAffichee | null }[];
};
