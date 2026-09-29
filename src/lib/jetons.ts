/**
 * Jetons opaques (sessions, liens d'invitation et de réinitialisation) : 256 bits aléatoires
 * en base64url. Seule leur empreinte SHA-256 est stockée ; l'aléa de 256 bits rend inutile un
 * hachage lent.
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** 32 octets en base64url sans remplissage : 43 caractères. */
export const FORMAT_JETON = /^[A-Za-z0-9_-]{43}$/;

export function genererJeton(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hexadécimal : empreinte d'un jeton, ou clé de limiteur sans donnée personnelle en clair. */
export function sha256Hex(texte: string): string {
  return createHash("sha256").update(texte, "utf8").digest("hex");
}
