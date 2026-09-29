/**
 * Signature d'un contenu lisible par le navigateur (ticket d'entrée, décision D6 du plan du lot 4) :
 * `contenu.signature`, HMAC-SHA256 en base64url. La clé est propre à chaque usage, dérivée de
 * `CHIFFREMENT_CLE` par HKDF-SHA256 : jamais la clé AES elle-même, aucune nouvelle variable.
 */
import "server-only";
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { env } from "./env";

function cle(usage: string): Buffer {
  const maitresse = Buffer.from(env().CHIFFREMENT_CLE, "base64");
  return Buffer.from(hkdfSync("sha256", maitresse, Buffer.alloc(0), `carreau/${usage}`, 32));
}

function empreinte(contenu: string, usage: string): string {
  return createHmac("sha256", cle(usage)).update(contenu, "utf8").digest("base64url");
}

/** `contenu.signature` : lisible, infalsifiable sans la clé. */
export function signer(contenu: string, usage: string): string {
  return `${contenu}.${empreinte(contenu, usage)}`;
}

/** Contenu d'une valeur produite par `signer` pour le même usage, ou null (format, usage ou clé faux). */
export function verifierSignature(valeur: string, usage: string): string | null {
  const point = valeur.lastIndexOf(".");
  if (point <= 0) return null;
  const contenu = valeur.slice(0, point);
  const recue = Buffer.from(valeur.slice(point + 1), "utf8");
  const attendue = Buffer.from(empreinte(contenu, usage), "utf8");
  return recue.length === attendue.length && timingSafeEqual(recue, attendue) ? contenu : null;
}
