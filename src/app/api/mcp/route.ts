import { traiterRequeteMcp } from "@/modules/mcp";

/**
 * Serveur MCP (spec §10). Branchement d'un assistant :
 *   claude mcp add --transport http carreau <APP_URL>/api/mcp --header "Authorization: Bearer <jeton>"
 * Seul POST est servi : sans état, GET et DELETE n'ont pas d'usage, et Next répond 405 sans lire le jeton.
 */
export async function POST(requete: Request): Promise<Response> {
  return traiterRequeteMcp(requete);
}
