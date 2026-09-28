import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "./index";

describe("base de test isolée", () => {
  it("répond et contient les tables du socle", async () => {
    const resultat = await db().execute<{ nom: string }>(
      sql`SELECT table_name AS nom FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    expect(resultat.rows.map((ligne) => ligne.nom)).toEqual(expect.arrayContaining(["journal", "limiteur"]));
  });

  it("n'est jamais la base de développement", () => {
    expect(new URL(process.env.DATABASE_URL ?? "http://x/").pathname).toMatch(/^\/carreau_t_[0-9a-f]{32}$/);
  });
});
