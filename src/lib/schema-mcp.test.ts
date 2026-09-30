import { describe, expect, it } from "vitest";
import { z } from "zod";
import { schemaPermissifPourSdk } from "./schema-mcp";

describe("schemaPermissifPourSdk", () => {
  const schema = z.strictObject({ qcmId: z.string().describe("Identifiant du QCM, donné par qcm_lister.") });
  const permissif = schemaPermissifPourSdk(schema);

  it("publie le schéma JSON strict de l'outil", () => {
    expect(permissif["~standard"].jsonSchema.input({ target: "draft-2020-12" })).toMatchObject({
      type: "object",
      properties: { qcmId: { type: "string", description: "Identifiant du QCM, donné par qcm_lister." } },
      required: ["qcmId"],
      additionalProperties: false,
    });
  });

  it("accepte tout objet à la validation du SDK, la vraie validation vient ensuite", () => {
    expect(permissif["~standard"].vendor).toBe("carreau");
    expect(permissif["~standard"].validate({ intrus: 1 })).toEqual({ value: { intrus: 1 } });
    expect(permissif["~standard"].validate(undefined)).toEqual({ value: {} });
  });
});
