/**
 * Révocation des jetons MCP d'un compte (spec §5) : à la désactivation, et à toute réinitialisation du
 * mot de passe ou de la double authentification (amendement A1 du plan du lot 8). Un jeton créé par
 * quelqu'un qui aurait pris la main sur le compte ne survit pas à la reprise du compte.
 */
import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import type { Executeur } from "@/db";
import { jetonMcp } from "@/db/schema";
import { maintenant } from "@/lib/horloge";

/** Révoque les jetons MCP actifs du compte, dans la transaction de l'appelant ; renvoie leur nombre. */
export async function revoquerJetonsMcpDuCompte(
  utilisateurId: string,
  executeur: Executeur,
): Promise<number> {
  const revoques = await executeur
    .update(jetonMcp)
    .set({ revoqueLe: maintenant() })
    .where(and(eq(jetonMcp.enseignantId, utilisateurId), isNull(jetonMcp.revoqueLe)))
    .returning({ id: jetonMcp.id });
  return revoques.length;
}
