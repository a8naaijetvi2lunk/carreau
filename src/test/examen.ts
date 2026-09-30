/** Données de test de l'examen (plan du lot 5) : examen démarré avec les vrais services. */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { participation, reponse, sessionExamen } from "@/db/schema";
import { definirHorlogePourLesTests, maintenant, type horlogeFixe } from "@/lib/horloge";
import { cloturerSiFinie } from "@/modules/examen";
import { demarrerSession } from "@/modules/sessions";
import { creerEtudiantTest } from "./classes";
import { exiger } from "./comptes";
import { creerParticipationTest, preparerSession, renseignerRgpd } from "./sessions";

type TelephoneExamen = {
  etudiant: Awaited<ReturnType<typeof preparerSession>>["etudiants"][number];
  participation: Awaited<ReturnType<typeof creerParticipationTest>>["participation"];
  jeton: string;
};

/**
 * Session démarrée : chaque étudiant a une participation (information lue) ; l'horloge est avancée
 * jusqu'au départ commun. `horloge` : horloge figée du fichier de test, déjà installée.
 */
export async function examenEnCours(
  horloge: ReturnType<typeof horlogeFixe>,
  options: Parameters<typeof preparerSession>[0] = {},
) {
  await renseignerRgpd();
  const prep = await preparerSession(options);
  const telephones: TelephoneExamen[] = [];
  for (const etudiant of prep.etudiants) {
    const { participation: p, jeton } = await creerParticipationTest(prep.session.id, etudiant.id, {
      informationLue: true,
    });
    telephones.push({ etudiant, participation: p, jeton });
  }
  const { demarreLe } = await demarrerSession(prep.acteur, { sessionId: prep.session.id });
  horloge.fixer(demarreLe);
  definirHorlogePourLesTests(horloge);
  return { ...prep, telephones, demarreLe };
}

export async function passageEnBase(participationId: string) {
  const [p] = await db().select().from(participation).where(eq(participation.id, participationId));
  return exiger(p, "participation");
}

/** Positions affichées (« 0 » à « 7 ») des réponses dont le texte est donné, à ce rang pour cet étudiant. */
export async function identifiants(
  participationId: string,
  rang: number,
  textes: string[],
): Promise<string[]> {
  const p = await passageEnBase(participationId);
  const [s] = await db()
    .select({ contenu: sessionExamen.contenu })
    .from(sessionExamen)
    .where(eq(sessionExamen.id, p.sessionId));
  const entree = exiger(p.ordre?.[rang - 1], "rang");
  const question = exiger(s?.contenu?.questions[entree.q], "question");
  return textes.map((texte) => {
    const origine = question.propositions.findIndex((x) => x.texte === texte);
    const position = entree.p.indexOf(origine);
    if (origine < 0 || position < 0) throw new Error(`Réponse « ${texte} » absente au rang ${rang}.`);
    return String(position);
  });
}

/** Question de l'instantané au rang donné pour cet étudiant (clé, énoncé, propositions). */
export async function questionDuRang(participationId: string, rang: number) {
  const p = await passageEnBase(participationId);
  const [s] = await db()
    .select({ contenu: sessionExamen.contenu })
    .from(sessionExamen)
    .where(eq(sessionExamen.id, p.sessionId));
  const entree = exiger(p.ordre?.[rang - 1], "rang");
  return exiger(s?.contenu?.questions[entree.q], "question");
}

/** Brouillon posé directement en base : `textes` des réponses cochées, à ce rang. */
export async function poserBrouillon(participationId: string, rang: number, textes: string[]): Promise<void> {
  const question = await questionDuRang(participationId, rang);
  const selection = textes.map((texte) => question.propositions.findIndex((x) => x.texte === texte));
  if (selection.some((i) => i < 0)) throw new Error(`Réponse absente au rang ${rang}.`);
  await db()
    .insert(reponse)
    .values({
      participationId,
      questionCle: question.cle,
      selectionBrouillon: selection.sort((a, b) => a - b),
    });
}

/** Réponses d'une participation, par clé de question. */
export async function reponsesEnBase(participationId: string) {
  return db().select().from(reponse).where(eq(reponse.participationId, participationId));
}

/**
 * Examen terminé pour tous (Léa, Sacha et Hugo par défaut, 60 s après le départ), et deux absents
 * ajoutés à la classe sans participation : Inès Martin et Tom Bernard (rattrapages, lot 7).
 * `pendant` joue les réponses et les événements à 30 s du départ, avant la fin.
 */
export async function examenTermine(
  horloge: ReturnType<typeof horlogeFixe>,
  options: Parameters<typeof preparerSession>[0] & {
    pendant?: (x: Awaited<ReturnType<typeof examenEnCours>>) => Promise<void>;
  } = {},
) {
  const { pendant, ...preparation } = options;
  const x = await examenEnCours(horloge, preparation);
  const ines = await creerEtudiantTest(x.classe.id, { nom: "Martin", prenom: "Inès" });
  const tom = await creerEtudiantTest(x.classe.id, { nom: "Bernard", prenom: "Tom" });
  if (pendant) {
    horloge.fixer(new Date(x.demarreLe.getTime() + 30_000));
    await pendant(x);
  }
  horloge.fixer(new Date(x.demarreLe.getTime() + 60_000));
  if (!(await cloturerSiFinie(x.session.id, maintenant(), { forcer: true }))) {
    throw new Error("examen de test non clos");
  }
  return { ...x, absents: [ines, tom] as const };
}
