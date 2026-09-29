/**
 * Code tournant des sessions (spec §6.1 ; décision D5 et amendement A1 du plan du lot 4) : session
 * d'un code saisi, code et QR code affichés à l'enseignant.
 */
import "server-only";
import { inArray } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import { sessionExamen } from "@/db/schema";
import { env } from "@/lib/env";
import { maintenant } from "@/lib/horloge";
import type { CodeAffiche } from "@/lib/vue-session";
import { codeAccepte, codeCourant, formaterCode, normaliserCode } from "@/moteur/code-session";

/**
 * Session en salle d'attente ou en cours (A1) dont `saisie` est le code courant ou le précédent, ou
 * null (saisie illisible, code inconnu ou expiré).
 */
export async function sessionParCode(
  saisie: string,
): Promise<{ id: string; statut: "attente" | "en_cours" } | null> {
  const code = normaliserCode(saisie);
  if (!code) return null;
  const instant = maintenant();
  const candidates = await db()
    .select({ id: sessionExamen.id, statut: sessionExamen.statut, codeSecret: sessionExamen.codeSecret })
    .from(sessionExamen)
    .where(inArray(sessionExamen.statut, ["attente", "en_cours"]));
  for (const candidate of candidates) {
    if (
      (candidate.statut === "attente" || candidate.statut === "en_cours") &&
      codeAccepte(candidate.codeSecret, code, instant)
    ) {
      return { id: candidate.id, statut: candidate.statut };
    }
  }
  return null;
}

/**
 * Code à afficher (« K7M 4QP »), secondes avant le suivant, lien du QR code (le code reste dans le
 * fragment, jamais dans une requête : spec §6.1), adresse de saisie et QR code SVG (correction Q).
 */
export async function codeAffiche(codeSecret: string): Promise<CodeAffiche> {
  const { code, secondesRestantes } = codeCourant(codeSecret, maintenant());
  const appUrl = env().APP_URL;
  const lien = new URL(`/rejoindre#${code}`, appUrl).toString();
  const svg = await QRCode.toString(lien, { type: "svg", errorCorrectionLevel: "Q", margin: 2 });
  return {
    code: formaterCode(code),
    secondesRestantes,
    lien,
    adresse: `${new URL(appUrl).host}/rejoindre`,
    qrCode: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  };
}
