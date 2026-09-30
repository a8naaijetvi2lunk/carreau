/**
 * Schéma d'entrée remis au SDK MCP (décision D8 du plan du lot 8) : il PUBLIE le schéma JSON strict de
 * l'outil (`tools/list`) mais ACCEPTE tout objet. Le SDK validerait sinon les arguments avant l'outil et
 * répondrait en anglais, avant le contrôle de portée. La validation réelle a lieu dans `executerOutil`,
 * après ce contrôle : un jeton en lecture seule reçoit toujours « lecture seule », et une erreur de
 * paramètres garde le format de Carreau.
 */
import type { StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import type { z } from "zod";

export function schemaPermissifPourSdk(schema: z.ZodObject): StandardSchemaWithJSON<unknown, unknown> {
  return {
    "~standard": {
      version: 1,
      vendor: "carreau",
      validate: (valeur: unknown) => ({ value: valeur ?? {} }),
      jsonSchema: schema["~standard"].jsonSchema,
    },
  };
}
