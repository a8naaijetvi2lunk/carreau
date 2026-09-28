import { afterEach, describe, expect, it, vi } from "vitest";
import { fermerDbPourLesTests } from "@/db";
import { reinitialiserEnvPourLesTests } from "@/lib/env";
import { verifierBase } from "./sante";

describe("verifierBase", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renvoie vrai quand la base répond", async () => {
    expect(await verifierBase()).toBe(true);
  });

  it("renvoie faux, sans lever, quand la base est injoignable", async () => {
    const espion = vi.spyOn(console, "error").mockImplementation(() => {});
    const url = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = "postgres://carreau:carreau@127.0.0.1:1/inexistante";
      reinitialiserEnvPourLesTests();
      await fermerDbPourLesTests();
      expect(await verifierBase()).toBe(false);
      expect(espion).toHaveBeenCalledOnce();
    } finally {
      process.env.DATABASE_URL = url;
      reinitialiserEnvPourLesTests();
      await fermerDbPourLesTests();
    }
  });
});
