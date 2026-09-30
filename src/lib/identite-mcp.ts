/**
 * Identité d'un appel MCP transmise au SDK (spec §10 ; décisions D2 et D5 du plan du lot 8). Le serveur
 * vérifie le jeton avant `withMcpAuth`, qui ne fait que transmettre cette `AuthInfo` aux outils. Le jeton
 * en clair n'y figure jamais : `token` porte son identifiant (le SDK exige une chaîne), ce qui évite toute
 * fuite par un journal du SDK.
 */
import type { AuthInfo } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { ActeurUtilisateur } from "./acteur";
import { PORTEES_MCP } from "./regles-mcp";
import { ROLES } from "./roles";

const schemaActeur = z.strictObject({
  type: z.literal("utilisateur"),
  id: z.string(),
  sessionId: z.null(),
  jetonMcp: z.strictObject({ id: z.string(), portee: z.enum(PORTEES_MCP) }),
  email: z.string(),
  nom: z.string(),
  prenom: z.string(),
  role: z.enum(ROLES),
});

export function authInfoDepuisActeur(acteur: ActeurUtilisateur): AuthInfo {
  if (!acteur.jetonMcp) throw new Error("Acteur sans jeton MCP.");
  return {
    token: acteur.jetonMcp.id,
    clientId: acteur.jetonMcp.id,
    scopes: [acteur.jetonMcp.portee],
    extra: { acteur },
  };
}

/** Acteur d'un appel d'outil, relu depuis l'`AuthInfo` ; null si elle manque ou ne correspond pas. */
export function acteurDepuisAuthInfo(authInfo: AuthInfo | undefined): ActeurUtilisateur | null {
  const lu = schemaActeur.safeParse(authInfo?.extra?.acteur);
  return lu.success ? lu.data : null;
}
