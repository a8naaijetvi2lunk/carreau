import { z, type ZodError } from "zod";

// Messages de validation Zod en français pour tout le serveur : ils sont lus par
// les étudiants, les enseignants et les assistants IA via MCP.
z.config(z.locales.fr());

/** Codes d'erreur métier renvoyés par les services. */
export type CodeErreur =
  "NON_CONNECTE" | "ACCES_REFUSE" | "INTROUVABLE" | "VALIDATION" | "ETAT" | "CONFLIT" | "LIMITE_ATTEINTE";

const STATUTS_HTTP: Record<CodeErreur, number> = {
  NON_CONNECTE: 401,
  ACCES_REFUSE: 403,
  INTROUVABLE: 404,
  VALIDATION: 422,
  ETAT: 409,
  CONFLIT: 409,
  LIMITE_ATTEINTE: 429,
};

/**
 * Erreur métier attendue, levée par les services. Son message est destiné à
 * l'utilisateur : clair, sans secret ni détail technique. Une ressource
 * d'autrui lève INTROUVABLE (on ne révèle pas qu'elle existe).
 */
export class ErreurService extends Error {
  readonly code: CodeErreur;
  readonly statutHttp: number;
  readonly details?: unknown;

  constructor(code: CodeErreur, message: string, details?: unknown) {
    super(message);
    this.name = "ErreurService";
    this.code = code;
    this.statutHttp = STATUTS_HTTP[code];
    if (details !== undefined) this.details = details;
  }
}

/** Détail lisible d'une erreur de validation. */
export type DetailValidation = { chemin: string; message: string };

export const erreurs = {
  nonConnecte(message = "Tu dois être connecté pour continuer.") {
    return new ErreurService("NON_CONNECTE", message);
  },
  accesRefuse(message = "Tu n'as pas accès à cette ressource.") {
    return new ErreurService("ACCES_REFUSE", message);
  },
  /** `quoi` : nom au singulier, sans article (« Session ») → « Session introuvable. » */
  introuvable(quoi: string) {
    return new ErreurService("INTROUVABLE", `${quoi} introuvable.`);
  },
  validation(message: string, details?: unknown) {
    return new ErreurService("VALIDATION", message, details);
  },
  /** `details` facultatif : raison exploitable par l'interface (ex. `{ raison: "terminee" }`). */
  etat(message: string, details?: unknown) {
    return new ErreurService("ETAT", message, details);
  },
  conflit(message: string) {
    return new ErreurService("CONFLIT", message);
  },
  limiteAtteinte(message: string, reessayerApresSecondes?: number) {
    return new ErreurService(
      "LIMITE_ATTEINTE",
      message,
      reessayerApresSecondes === undefined ? undefined : { reessayerApresSecondes },
    );
  },
};

/** ErreurService VALIDATION à partir de détails : message résumé (5 premiers) et `details` complet. */
export function erreurDepuisDetails(details: DetailValidation[], contexte: string): ErreurService {
  const resume = details
    .slice(0, 5)
    .map((d) => (d.chemin ? `${d.chemin} : ${d.message}` : d.message))
    .join(" ; ");
  const suite = details.length > 5 ? ` (et ${details.length - 5} autre(s))` : "";
  return erreurs.validation(`${contexte} : données invalides (${resume}${suite})`, details);
}

/** Transforme une erreur Zod en ErreurService VALIDATION : `details` = [{ chemin: "a.0.b", message }]. */
export function erreurDepuisZod(erreur: ZodError, contexte: string): ErreurService {
  return erreurDepuisDetails(
    erreur.issues.map((issue) => ({ chemin: issue.path.map(String).join("."), message: issue.message })),
    contexte,
  );
}
