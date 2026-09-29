/**
 * Ticket d'entrée (spec §6.2, décision D6 du plan du lot 4) : après un code valable, le téléphone
 * reçoit un ticket signé, lié à la session et valable 10 minutes. La recherche et la réclamation ne
 * dépendent plus du code qui tourne. Format `v1.<session>.<expiration ms>.<nonce>.<signature>`.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { maintenant } from "@/lib/horloge";
import { signer, verifierSignature } from "@/lib/signature";

export const DUREE_TICKET_MS = 10 * 60_000;

const USAGE = "ticket-entree";
const LONGUEUR_MAX = 300;
const FORMAT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FORMAT_EXPIRATION = /^\d{1,15}$/;
const FORMAT_NONCE = /^[A-Za-z0-9_-]{22}$/;

export type Ticket = { sessionId: string; nonce: string; expireLe: Date };

/** Ticket signé pour `sessionId`, valable 10 minutes à partir de maintenant. */
export function emettreTicket(sessionId: string): string {
  const expire = maintenant().getTime() + DUREE_TICKET_MS;
  const nonce = randomBytes(16).toString("base64url");
  return signer(["v1", sessionId, String(expire), nonce].join("."), USAGE);
}

/** Ticket valable (signature, format, expiration), ou null. */
export function lireTicket(valeur: string | null): Ticket | null {
  if (!valeur || valeur.length > LONGUEUR_MAX) return null;
  const contenu = verifierSignature(valeur, USAGE);
  if (!contenu) return null;
  const [version, sessionId, expire, nonce, ...reste] = contenu.split(".");
  if (
    version !== "v1" ||
    reste.length > 0 ||
    !sessionId ||
    !FORMAT_UUID.test(sessionId) ||
    !expire ||
    !FORMAT_EXPIRATION.test(expire) ||
    !nonce ||
    !FORMAT_NONCE.test(nonce)
  ) {
    return null;
  }
  const expireLe = new Date(Number(expire));
  if (expireLe.getTime() <= maintenant().getTime()) return null;
  return { sessionId, nonce, expireLe };
}
