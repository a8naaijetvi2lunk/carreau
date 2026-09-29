// Fonctions partagées par les scripts d'administration (admin:creer, admin:reinitialiser-totp).
// JavaScript pur : ces scripts tournent dans l'image Docker, sans TypeScript ni alias @/.
// Les valeurs DUPLIQUÉES des modules TypeScript sont vérifiées par scripts/admin.test.ts.
import { createHash, randomBytes } from "node:crypto";

/** = VALIDITE_INVITATION_DEFAUT_JOURS de src/modules/parametres/parametres.ts */
export const VALIDITE_INVITATION_JOURS = 7;

/** Erreur d'usage : message affiché tel quel, code de sortie 1. */
export class ErreurScript extends Error {}

/** = genererJeton de src/lib/jetons.ts */
export function genererJeton() {
  return randomBytes(32).toString("base64url");
}

/** = sha256Hex de src/lib/jetons.ts */
export function sha256Hex(texte) {
  return createHash("sha256").update(texte, "utf8").digest("hex");
}

/** = cleConnexionCompte de src/modules/auth/cles.ts */
export function cleConnexionCompte(email) {
  return `connexion:compte:${sha256Hex(email)}`;
}

/** = cleDoubleAuth de src/modules/auth/cles.ts */
export function cleDoubleAuth(utilisateurId) {
  return `double_auth:compte:${utilisateurId}`;
}

/** = z.regexes.email de Zod 4, utilisée par schemaEmail (src/lib/saisies.ts) ; vérifiée par scripts/admin.test.ts. */
export const REGEX_EMAIL =
  /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;

/** Adresse normalisée comme schemaEmail (src/lib/saisies.ts) : sans espaces, en minuscules. */
export function normaliserEmail(saisie) {
  const email = String(saisie ?? "")
    .trim()
    .toLowerCase();
  if (email.length === 0 || email.length > 254 || !REGEX_EMAIL.test(email)) {
    throw new ErreurScript("Adresse email invalide.");
  }
  return email;
}
