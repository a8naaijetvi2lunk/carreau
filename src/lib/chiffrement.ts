/**
 * Chiffrement symétrique AES-256-GCM (spec §5 et §9.3) : secret TOTP et clé Resend stockés
 * en base. Clé : `CHIFFREMENT_CLE` (base64, 32 octets).
 *
 * Format versionné : `v1.<iv>.<tag>.<données>`, chaque partie en base64url
 * (iv de 12 octets, tag d'authentification de 16 octets).
 */
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const VERSION = "v1";
const LONGUEUR_IV = 12;
const LONGUEUR_TAG = 16;

function cle(): Buffer {
  return Buffer.from(env().CHIFFREMENT_CLE, "base64");
}

/** Chiffre un texte UTF-8. Deux appels sur le même texte donnent des résultats différents (iv aléatoire). */
export function chiffrer(texte: string): string {
  const iv = randomBytes(LONGUEUR_IV);
  const chiffreur = createCipheriv("aes-256-gcm", cle(), iv, { authTagLength: LONGUEUR_TAG });
  const donnees = Buffer.concat([chiffreur.update(texte, "utf8"), chiffreur.final()]);
  const tag = chiffreur.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), donnees.toString("base64url")].join(
    ".",
  );
}

/**
 * Déchiffre un texte produit par `chiffrer`. Lève une `Error` technique si le format, la
 * version, la clé ou l'intégrité ne conviennent pas (à convertir en message utilisateur par
 * le service appelant).
 */
export function dechiffrer(texteChiffre: string): string {
  const parties = texteChiffre.split(".");
  if (parties.length !== 4 || parties[0] !== VERSION) {
    throw new Error("Texte chiffré : format ou version non reconnu.");
  }
  const [iv, tag, donnees] = parties.slice(1).map((partie) => {
    const octets = Buffer.from(partie, "base64url");
    // Encodage canonique exigé : Buffer ignore en silence les caractères en trop.
    if (octets.toString("base64url") !== partie) throw new Error("Texte chiffré : encodage invalide.");
    return octets;
  }) as [Buffer, Buffer, Buffer];
  if (iv.length !== LONGUEUR_IV || tag.length !== LONGUEUR_TAG) {
    throw new Error("Texte chiffré : format non reconnu.");
  }
  const dechiffreur = createDecipheriv("aes-256-gcm", cle(), iv, { authTagLength: LONGUEUR_TAG });
  dechiffreur.setAuthTag(tag);
  return Buffer.concat([dechiffreur.update(donnees), dechiffreur.final()]).toString("utf8");
}
