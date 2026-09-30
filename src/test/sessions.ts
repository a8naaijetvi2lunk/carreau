/** Données de test des sessions (base isolée) : insertion directe. */
import { db } from "@/db";
import { demandeAppareil, parametres, participation, sessionExamen } from "@/db/schema";
import { maintenant } from "@/lib/horloge";
import { genererJeton, sha256Hex } from "@/lib/jetons";
import type { ModeChrono } from "@/lib/regles-qcm";
import type {
  MotifDemande,
  StatutDemande,
  StatutParticipation,
  StatutSession,
  TypeSession,
} from "@/lib/regles-session";
import { creerClasseTest, creerEtudiantTest } from "./classes";
import { acteurDe, creerUtilisateur, exiger } from "./comptes";
import { creerQcmTest, creerQuestionTest } from "./qcm";

/** Secret de code des sessions de test : 32 octets à 1. À `INSTANT_CODE_TEST`, son code est « 3PD4Y2 » (10 s restantes). */
export const SECRET_CODE_TEST = Buffer.alloc(32, 1).toString("base64url");
/** 21/09/2026 14:13:20 UTC, dans la fenêtre 59 666 666 ; code précédent « QXCPKC ». */
export const INSTANT_CODE_TEST = 1_790_000_000_000;

export async function creerSessionTest(
  enseignantId: string,
  qcmId: string,
  classeId: string,
  options: {
    statut?: StatutSession;
    codeSecret?: string;
    creneauPrevuLe?: Date | null;
    demarreLe?: Date | null;
    termineLe?: Date | null;
    type?: TypeSession;
    sessionOrigineId?: string | null;
  } = {},
) {
  const [creee] = await db()
    .insert(sessionExamen)
    .values({
      qcmId,
      classeId,
      enseignantId,
      statut: options.statut ?? "attente",
      type: options.type ?? "classe",
      sessionOrigineId: options.sessionOrigineId ?? null,
      codeSecret: options.codeSecret ?? genererJeton(),
      creneauPrevuLe: options.creneauPrevuLe ?? null,
      noteVisible: true,
      correctionVisible: false,
      creeLe: maintenant(),
      demarreLe: options.demarreLe ?? null,
      termineLe: options.termineLe ?? null,
    })
    .returning();
  return exiger(creee, "session");
}

/** Participation et jeton d'appareil en clair (cookie du téléphone de test). */
export async function creerParticipationTest(
  sessionId: string,
  etudiantId: string,
  options: { informationLue?: boolean; statut?: StatutParticipation } = {},
) {
  const jeton = genererJeton();
  const [creee] = await db()
    .insert(participation)
    .values({
      sessionId,
      etudiantId,
      appareilJetonHash: sha256Hex(jeton),
      statut: options.statut ?? "attente",
      informationLueLe: options.informationLue ? maintenant() : null,
      rejointeLe: maintenant(),
      dernierContactLe: maintenant(),
    })
    .returning();
  return { participation: exiger(creee, "participation"), jeton };
}

/** Demande d'appareil et jeton en clair du téléphone demandeur. */
export async function creerDemandeTest(
  participationId: string,
  options: { motif?: MotifDemande; statut?: StatutDemande; creeLe?: Date } = {},
) {
  const jeton = genererJeton();
  const [creee] = await db()
    .insert(demandeAppareil)
    .values({
      participationId,
      motif: options.motif ?? "second_appareil",
      jetonHash: sha256Hex(jeton),
      statut: options.statut ?? "en_attente",
      creeLe: options.creeLe ?? maintenant(),
    })
    .returning();
  return { demande: exiger(creee, "demande"), jeton };
}

/** Conservation renseignée : condition de création et de démarrage d'une session (spec §9.4). */
export async function renseignerRgpd(): Promise<void> {
  const valeurs = {
    conservationEvenementsJours: 30,
    conservationResultatsJours: 365,
    contactDonnees: "Direction des études (exemple)",
  };
  await db()
    .insert(parametres)
    .values({ id: 1, ...valeurs })
    .onConflictDoUpdate({ target: parametres.id, set: valeurs });
}

export type EtudiantAPreparer = { nom: string; prenom: string; tiersTemps?: boolean };

const ETUDIANTS_PAR_DEFAUT: EtudiantAPreparer[] = [
  { nom: "Dupont", prenom: "Léa" },
  { nom: "Dupré", prenom: "Sacha" },
  { nom: "Dupuis", prenom: "Hugo" },
];

/**
 * Enseignante « Claire Arnaud », classe « TD2 » (Léa Dupont, Sacha Dupré, Hugo Dupuis par défaut),
 * QCM prêt « Algorithmique — Contrôle 2 » de deux questions (chrono global de 20 min, −0,25 par
 * erreur) et session. `qcm` et `questions` remplacent le QCM par défaut (tests de l'examen).
 */
export async function preparerSession(
  options: {
    etudiants?: EtudiantAPreparer[];
    statut?: StatutSession;
    codeSecret?: string;
    demarreLe?: Date | null;
    qcm?: { modeChrono?: ModeChrono; dureeGlobaleS?: number | null; dureeQuestionS?: number | null };
    questions?: Parameters<typeof creerQuestionTest>[1][];
  } = {},
) {
  const enseignant = await creerUtilisateur({ prenom: "Claire", nom: "Arnaud" });
  const acteur = acteurDe(enseignant);
  const classe = await creerClasseTest(enseignant.id, { nom: "TD2" });
  const etudiants: Awaited<ReturnType<typeof creerEtudiantTest>>[] = [];
  for (const e of options.etudiants ?? ETUDIANTS_PAR_DEFAUT)
    etudiants.push(await creerEtudiantTest(classe.id, e));
  const qcm = await creerQcmTest(enseignant.id, {
    titre: "Algorithmique — Contrôle 2",
    statut: "pret",
    modeChrono: options.qcm?.modeChrono ?? "global",
    dureeGlobaleS: options.qcm?.dureeGlobaleS === undefined ? 1200 : options.qcm.dureeGlobaleS,
    dureeQuestionS: options.qcm?.dureeQuestionS ?? null,
  });
  for (const q of options.questions ?? [{ pointsMauvaise: -0.25 }, { pointsMauvaise: -0.25 }]) {
    await creerQuestionTest(qcm.id, q);
  }
  const session = await creerSessionTest(enseignant.id, qcm.id, classe.id, {
    statut: options.statut,
    codeSecret: options.codeSecret,
    demarreLe: options.demarreLe,
  });
  return { enseignant, acteur, classe, etudiants, qcm, session };
}
