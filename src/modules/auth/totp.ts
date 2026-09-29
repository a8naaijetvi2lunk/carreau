/**
 * Double authentification TOTP (spec §5), écrite sans dépendance (amendement A1 du plan du
 * lot 1) : HOTP selon la RFC 4226 (HMAC-SHA1, troncature dynamique), TOTP selon la RFC 6238
 * (pas de 30 s, 6 chiffres), base32 selon la RFC 4648. Tolérance d'un pas de part et d'autre ;
 * l'anti-rejeu repose sur `utilisateur.totp_dernier_pas` (voir connexion.ts). Secret stocké
 * chiffré (AES-256-GCM).
 */
import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { chiffrer, dechiffrer } from "@/lib/chiffrement";

export const EMETTEUR_TOTP = "Carreau";
export const PERIODE_TOTP_SECONDES = 30;
export const CHIFFRES_TOTP = 6;
/** 160 bits, taille recommandée par la RFC 4226. */
const OCTETS_SECRET = 20;
const ALPHABET_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Code HOTP (RFC 4226) du compteur : HMAC-SHA1 du compteur sur 8 octets, troncature dynamique. */
export function genererCodeHotp(
  secret: Uint8Array,
  compteur: number,
  chiffres: number = CHIFFRES_TOTP,
): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(compteur));
  const empreinte = createHmac("sha1", secret).update(message).digest();
  const decalage = empreinte.readUInt8(empreinte.length - 1) & 0x0f;
  const valeur = empreinte.readUInt32BE(decalage) & 0x7fffffff;
  return String(valeur % 10 ** chiffres).padStart(chiffres, "0");
}

/** Base32 (RFC 4648) sans remplissage, alphabet majuscule : format du secret des URI otpauth. */
export function encoderBase32(octets: Uint8Array): string {
  let resultat = "";
  let bits = 0;
  let valeur = 0;
  for (const octet of octets) {
    valeur = (valeur << 8) | octet;
    bits += 8;
    while (bits >= 5) {
      resultat += ALPHABET_BASE32.charAt((valeur >>> (bits - 5)) & 31);
      bits -= 5;
    }
    valeur &= (1 << bits) - 1;
  }
  if (bits > 0) resultat += ALPHABET_BASE32.charAt((valeur << (5 - bits)) & 31);
  return resultat;
}

export function genererSecretTotp(): Uint8Array {
  return new Uint8Array(randomBytes(OCTETS_SECRET));
}

export function chiffrerSecretTotp(secret: Uint8Array): string {
  return chiffrer(Buffer.from(secret).toString("base64url"));
}

/** Lève une `Error` technique si le texte est illisible (clé changée, donnée corrompue). */
export function dechiffrerSecretTotp(texte: string): Uint8Array {
  return new Uint8Array(Buffer.from(dechiffrer(texte), "base64url"));
}

/** Pas temporel (compteur TOTP) d'un instant. */
export function pasTotp(instant: Date): number {
  return Math.floor(instant.getTime() / 1000 / PERIODE_TOTP_SECONDES);
}

/**
 * Pas du code s'il est valide à un pas près de `instant`, null sinon. Comparaison en temps
 * constant. Ne gère pas le rejeu.
 */
export function pasDuCode(secret: Uint8Array, code: string, instant: Date): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const saisi = Buffer.from(code, "ascii");
  const courant = pasTotp(instant);
  for (let pas = courant - 1; pas <= courant + 1; pas++) {
    if (timingSafeEqual(Buffer.from(genererCodeHotp(secret, pas), "ascii"), saisi)) return pas;
  }
  return null;
}

/** URI `otpauth://totp/…` lue par les applications d'authentification. */
export function uriTotp(secret: Uint8Array, email: string): string {
  const libelle = `${encodeURIComponent(EMETTEUR_TOTP)}:${encodeURIComponent(email)}`;
  const parametres = new URLSearchParams({
    secret: encoderBase32(secret),
    issuer: EMETTEUR_TOTP,
    algorithm: "SHA1",
    digits: String(CHIFFRES_TOTP),
    period: String(PERIODE_TOTP_SECONDES),
  });
  return `otpauth://totp/${libelle}?${parametres.toString()}`;
}

/** Clé à saisir à la main : le secret base32 de l'URI, par groupes de 4 caractères. */
export function cleManuelle(uri: string): string {
  const secret = new URL(uri).searchParams.get("secret") ?? "";
  return secret.match(/.{1,4}/g)?.join(" ") ?? "";
}

/** QR code de l'URI, en image SVG sous forme d'URI `data:` (autorisée par la CSP `img-src`). */
export async function qrCodeTotp(uri: string): Promise<string> {
  const svg = await QRCode.toString(uri, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
