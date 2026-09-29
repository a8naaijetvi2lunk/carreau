/** Codes TOTP pour les tests de bout en bout, calculés depuis l'URI otpauth affichée à l'enrôlement. */
import { createHmac } from "node:crypto";

const ALPHABET_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function decoderBase32(texte: string): Uint8Array {
  let bits = 0;
  let valeur = 0;
  const octets: number[] = [];
  for (const caractere of texte.replace(/[\s=]/g, "").toUpperCase()) {
    const index = ALPHABET_BASE32.indexOf(caractere);
    if (index < 0) throw new Error(`Caractère base32 invalide : ${caractere}`);
    valeur = ((valeur << 5) | index) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      octets.push((valeur >> bits) & 0xff);
    }
  }
  return new Uint8Array(octets);
}

/** HOTP (RFC 4226), comme src/modules/auth/totp.ts. */
export function codeHotp(secret: Uint8Array, compteur: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(compteur));
  const empreinte = createHmac("sha1", secret).update(message).digest();
  const decalage = empreinte.readUInt8(empreinte.length - 1) & 0x0f;
  return String((empreinte.readUInt32BE(decalage) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** Secret de l'URI du lien « Ouvrir dans l’application d’authentification ». */
export function secretDepuisUri(uri: string): Uint8Array {
  const secret = new URL(uri).searchParams.get("secret");
  if (!secret) throw new Error(`URI otpauth sans secret : ${uri}`);
  return decoderBase32(secret);
}

/** Code du pas courant décalé de `decalage` (le serveur tolère un pas d'écart). */
export function codeTotp(secret: Uint8Array, decalage = 0): string {
  return codeHotp(secret, Math.floor(Date.now() / 30_000) + decalage);
}
