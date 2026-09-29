import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db, fermerDbPourLesTests } from "./index";

// Relevé pendant la collecte, avant tout hook : la base isolée doit déjà être la cible.
const URL_A_LA_COLLECTE = process.env.DATABASE_URL ?? "http://x/";

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

  it("vise la base isolée dès la collecte, avant tout hook", () => {
    expect(new URL(URL_A_LA_COLLECTE).pathname).toMatch(/^\/carreau_t_[0-9a-f]{32}$/);
  });
});

describe("pool", () => {
  let observation: Client | undefined;

  afterEach(async () => {
    await observation?.end();
    observation = undefined;
  });

  /** Connexion séparée du pool de `db()`, pour interroger `pg_stat_activity` depuis l'extérieur. */
  async function connecterObservation(): Promise<Client> {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    observation = client;
    return client;
  }

  async function pidsActifs(client: Client): Promise<number[]> {
    const resultat = await client.query<{ pid: number }>(
      "SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()",
    );
    return resultat.rows.map((ligne) => ligne.pid);
  }

  it("ne laisse aucune connexion ouverte une fois fermé", async () => {
    const client = await connecterObservation();

    await Promise.all([db().execute(sql`SELECT pg_sleep(0.05)`), db().execute(sql`SELECT pg_sleep(0.05)`)]);
    const pidsOuverts = await pidsActifs(client);
    expect(pidsOuverts.length).toBeGreaterThanOrEqual(2);

    await fermerDbPourLesTests();

    const pidsRestants = await pidsActifs(client);
    expect(pidsRestants.filter((pid) => pidsOuverts.includes(pid))).toEqual([]);
  });

  it("survit à une connexion inactive coupée par le serveur", async () => {
    const espionConsole = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const client = await connecterObservation();

      await db().execute(sql`SELECT 1`);

      await client.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()",
      );

      await vi.waitFor(() =>
        expect(espionConsole).toHaveBeenCalledWith(
          expect.stringContaining("[db] Erreur inattendue (réf. connexion-inactive)"),
          expect.anything(),
        ),
      );

      await expect(db().execute(sql`SELECT 1`)).resolves.toBeDefined();
    } finally {
      espionConsole.mockRestore();
    }
  });
});
