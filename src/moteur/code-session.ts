/**
 * Code de session tournant (spec §6.1, décision D5 du plan du lot 4) : HMAC-SHA256 du secret de la
 * session et du numéro de la fenêtre de 30 s, tronqué à 6 caractères de l'alphabet de Crockford
 * (sans I, L, O, U). Le code de la fenêtre courante et celui de la précédente sont acceptés.
 * Pur : aucun accès à la base, aucune horloge implicite (l'instant est toujours un paramètre).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const PERIODE_CODE_MS = 30_000;
export const LONGUEUR_CODE = 6;
/** Base32 de Crockford : chiffres, puis lettres sans I, L, O ni U. */
export const ALPHABET_CODE = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Numéro de la fenêtre de 30 s qui contient `instant`. */
export function fenetreCode(instant: Date): number {
  return Math.floor(instant.getTime() / PERIODE_CODE_MS);
}

/** Code de la fenêtre `fenetre` pour le secret d'une session (32 octets en base64url). */
export function calculerCode(secret: string, fenetre: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(fenetre));
  const empreinte = createHmac("sha256", Buffer.from(secret, "base64url")).update(message).digest();
  // 30 bits de poids fort des 4 premiers octets : 6 caractères de 5 bits.
  const valeur = empreinte.readUInt32BE(0) >>> 2;
  let code = "";
  for (let rang = LONGUEUR_CODE - 1; rang >= 0; rang--) {
    code += ALPHABET_CODE.charAt((valeur >>> (rang * 5)) & 31);
  }
  return code;
}

/** « K7M4QP » → « K7M 4QP » (maquette « Écran projeté »). */
export function formaterCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/**
 * Saisie d'un étudiant → code canonique, ou null : majuscules ; espaces, points, points médians et
 * tirets ignorés ; O lu 0, I et L lus 1 (décodage de Crockford) ; exactement 6 caractères de l'alphabet.
 */
export function normaliserCode(saisie: string): string | null {
  const code = saisie
    .toUpperCase()
    .replace(/[\s.·-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (code.length !== LONGUEUR_CODE) return null;
  for (const caractere of code) {
    if (!ALPHABET_CODE.includes(caractere)) return null;
  }
  return code;
}

/** Comparaison en temps constant (longueurs différentes : faux). */
function egaux(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Vrai si `code` (canonique) est celui de la fenêtre de `instant` ou de la précédente (30 à 60 s). */
export function codeAccepte(secret: string, code: string, instant: Date): boolean {
  const fenetre = fenetreCode(instant);
  return egaux(calculerCode(secret, fenetre), code) || egaux(calculerCode(secret, fenetre - 1), code);
}

/** Code à afficher à `instant`, et secondes avant le suivant (1 à 30). */
export function codeCourant(secret: string, instant: Date): { code: string; secondesRestantes: number } {
  const fenetre = fenetreCode(instant);
  const finMs = (fenetre + 1) * PERIODE_CODE_MS;
  return {
    code: calculerCode(secret, fenetre),
    secondesRestantes: Math.ceil((finMs - instant.getTime()) / 1000),
  };
}
