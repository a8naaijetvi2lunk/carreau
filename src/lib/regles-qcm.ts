/**
 * Règles d'un QCM (spec §4.2 ; décisions D3, D4 et D6 du plan du lot 3) : bornes de saisie et
 * contrôles qui décident du passage en « prêt ». Fonctions pures, partagées par le service `qcm`
 * et par l'éditeur, qui affiche les problèmes en direct : d'où `lib` et non `moteur`.
 */

export const TYPES_QUESTION = ["unique", "multiple", "vrai_faux"] as const;
export type TypeQuestion = (typeof TYPES_QUESTION)[number];

export const MODES_CHRONO = ["aucun", "global", "par_question"] as const;
export type ModeChrono = (typeof MODES_CHRONO)[number];

export const STATUTS_QCM = ["brouillon", "pret", "archive"] as const;
export type StatutQcm = (typeof STATUTS_QCM)[number];

export const ORIGINES_QCM = ["interface", "mcp"] as const;
export type OrigineQcm = (typeof ORIGINES_QCM)[number];

/** Langages des blocs de code (liste blanche, décision D13) et leur libellé. */
export const LANGAGES_CODE = {
  python: "Python",
  javascript: "JavaScript",
  typescript: "TypeScript",
  java: "Java",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  php: "PHP",
  sql: "SQL",
  html: "HTML",
  css: "CSS",
  bash: "Bash",
  json: "JSON",
  texte: "Texte brut",
} as const;
export type LangageCode = keyof typeof LANGAGES_CODE;
export const CLES_LANGAGES = Object.keys(LANGAGES_CODE) as [LangageCode, ...LangageCode[]];

export function estLangageCode(valeur: string): valeur is LangageCode {
  return Object.hasOwn(LANGAGES_CODE, valeur);
}

/** Bornes de saisie (décision D3). */
export const LIMITES_QCM = {
  titreMax: 120,
  enonceMax: 2000,
  codeMax: 4000,
  reponseMax: 500,
  reponsesMin: 2,
  reponsesMax: 8,
  questionsMax: 100,
  qcmParCompte: 500,
  dureeGlobaleMinutesMin: 1,
  dureeGlobaleMinutesMax: 300,
  dureeQuestionSecondesMin: 5,
  dureeQuestionSecondesMax: 1800,
} as const;

export const LIBELLES_TYPE: Record<TypeQuestion, string> = {
  unique: "Choix unique",
  multiple: "Choix multiples",
  vrai_faux: "Vrai / Faux",
};

/** Consigne affichée à l'étudiant (maquettes « Question avec code » et « Réponses en images »). */
export const CONSIGNES_TYPE: Record<TypeQuestion, string> = {
  unique: "Une seule réponse",
  multiple: "Plusieurs réponses possibles",
  vrai_faux: "Vrai ou faux",
};

export const LIBELLES_STATUT: Record<StatutQcm, string> = {
  brouillon: "Brouillon",
  pret: "Prêt",
  archive: "Archivé",
};

export type PropositionRegle = { texte: string; imageId: string | null; correcte: boolean };

export type QuestionRegle = {
  type: TypeQuestion;
  enonce: string;
  code: { langage: LangageCode; source: string } | null;
  propositions: PropositionRegle[];
};

export type QcmRegle = {
  modeChrono: ModeChrono;
  dureeGlobaleS: number | null;
  dureeQuestionS: number | null;
  questions: QuestionRegle[];
};

/** Texte d'une réponse comparé à celui des autres : espaces réduits, sans casse. */
function cleTexte(texte: string): string {
  return texte.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Ce qui empêche une question de passer en « prêt » (décision D4) ; liste vide si elle est complète. */
export function problemesQuestion(question: QuestionRegle): string[] {
  const problemes: string[] = [];
  if (question.enonce.trim() === "") problemes.push("L'énoncé est vide.");
  if (question.code && question.code.source.trim() === "") {
    problemes.push("Le bloc de code est vide : écris le code ou retire le bloc.");
  }
  const { propositions } = question;
  if (question.type === "vrai_faux") {
    if (propositions.length !== 2) problemes.push("Un vrai/faux a exactement 2 réponses.");
  } else if (propositions.length < LIMITES_QCM.reponsesMin) {
    problemes.push(`Il faut au moins ${LIMITES_QCM.reponsesMin} réponses.`);
  }
  propositions.forEach((p, i) => {
    if (p.texte.trim() === "" && p.imageId === null) problemes.push(`La réponse ${i + 1} est vide.`);
  });
  const dejaVues = new Map<string, number>();
  propositions.forEach((p, i) => {
    if (p.imageId !== null) return;
    const cle = cleTexte(p.texte);
    if (cle === "") return;
    const premiere = dejaVues.get(cle);
    if (premiere === undefined) dejaVues.set(cle, i + 1);
    else problemes.push(`Les réponses ${premiere} et ${i + 1} sont identiques.`);
  });
  const correctes = propositions.filter((p) => p.correcte).length;
  if (question.type === "multiple") {
    if (correctes === 0) problemes.push("Coche au moins une bonne réponse.");
  } else if (correctes === 0) {
    problemes.push("Coche la bonne réponse.");
  } else if (correctes > 1) {
    problemes.push("Une seule bonne réponse est possible pour ce type de question.");
  }
  return problemes;
}

/** Ce qui empêche un QCM de passer en « prêt » ; chaque problème de question porte son numéro. */
export function problemesQcm(qcm: QcmRegle): string[] {
  const problemes: string[] = [];
  if (qcm.questions.length === 0) problemes.push("Ajoute au moins une question.");
  if (qcm.modeChrono === "global" && qcm.dureeGlobaleS === null) {
    problemes.push("Indique la durée de l'examen (onglet Paramètres).");
  }
  if (qcm.modeChrono === "par_question" && qcm.dureeQuestionS === null) {
    problemes.push("Indique la durée par question (onglet Paramètres).");
  }
  qcm.questions.forEach((q, i) => {
    for (const probleme of problemesQuestion(q)) problemes.push(`Question ${i + 1} : ${probleme}`);
  });
  return problemes;
}

/**
 * Blocs de questions liées (spec §4.2, décision D6) : une chaîne `lieeASuivante` forme un bloc, dans
 * l'ordre. Une dernière question marquée liée (données incohérentes) ferme quand même son bloc.
 */
export function decouperEnBlocs<T extends { lieeASuivante: boolean }>(questions: readonly T[]): T[][] {
  const blocs: T[][] = [];
  let courant: T[] = [];
  for (const q of questions) {
    courant.push(q);
    if (!q.lieeASuivante) {
      blocs.push(courant);
      courant = [];
    }
  }
  if (courant.length > 0) blocs.push(courant);
  return blocs;
}

export const MESSAGE_DUREE_GLOBALE = `La durée de l'examen est un nombre entier de minutes, de ${LIMITES_QCM.dureeGlobaleMinutesMin} à ${LIMITES_QCM.dureeGlobaleMinutesMax}.`;
export const MESSAGE_DUREE_QUESTION = `La durée par question est un nombre entier de secondes, de ${LIMITES_QCM.dureeQuestionSecondesMin} à ${LIMITES_QCM.dureeQuestionSecondesMax}.`;

export function problemeDureeGlobaleMinutes(minutes: number): string | null {
  return Number.isInteger(minutes) &&
    minutes >= LIMITES_QCM.dureeGlobaleMinutesMin &&
    minutes <= LIMITES_QCM.dureeGlobaleMinutesMax
    ? null
    : MESSAGE_DUREE_GLOBALE;
}

export function problemeDureeQuestionS(secondes: number): string | null {
  return Number.isInteger(secondes) &&
    secondes >= LIMITES_QCM.dureeQuestionSecondesMin &&
    secondes <= LIMITES_QCM.dureeQuestionSecondesMax
    ? null
    : MESSAGE_DUREE_QUESTION;
}
