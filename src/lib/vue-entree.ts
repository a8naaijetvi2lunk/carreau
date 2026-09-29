/**
 * Vues de l'entrée des étudiants (plan du lot 4) : ce que le serveur renvoie au téléphone. Types
 * seuls, partagés par le module sessions et la page /rejoindre. Jamais le jeton d'un appareil, jamais
 * une donnée d'un autre étudiant (hormis les noms de la recherche, spec §6.2).
 */
import type { MotifDemande } from "./regles-session";
import type { ResumeExamen } from "./resume-examen";

/** En-tête commun : l'examen que l'étudiant rejoint (maquette « Rejoindre »). */
export type SessionAffichee = { titre: string; classe: string; enseignant: string };

/** Valeurs réelles des paramètres de conservation (spec §9.4). */
export type InformationDonnees = {
  conservationEvenementsJours: number;
  conservationResultatsJours: number;
  contact: string;
};

/** État du téléphone ; `serveurMaintenant` cale les comptes à rebours sur l'heure du serveur (§6.3). */
export type EtatEntree = { serveurMaintenant: string } & (
  | { etape: "code" }
  | { etape: "nom"; session: SessionAffichee; demarree: boolean }
  | { etape: "information"; session: SessionAffichee; prenom: string; information: InformationDonnees }
  | { etape: "attente"; session: SessionAffichee; prenom: string; connectes: number; examen: ResumeExamen }
  | { etape: "demarrage"; session: SessionAffichee; prenom: string; demarreLe: string }
  | {
      etape: "demande";
      session: SessionAffichee;
      etudiantId: string;
      statut: "en_attente" | "refusee" | "expiree";
      motif: MotifDemande;
    }
  | { etape: "remplace"; session: SessionAffichee }
  | { etape: "fermee"; session: SessionAffichee; raison: "annulee" | "terminee" }
);

export type EtudiantTrouve = { id: string; nom: string; prenom: string };

/** Résultat de la recherche d'un nom : 8 étudiants au plus ; `autres` s'il y en avait davantage. */
export type ResultatRecherche = { etudiants: EtudiantTrouve[]; autres: boolean };
