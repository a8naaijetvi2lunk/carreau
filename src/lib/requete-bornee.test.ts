import { describe, expect, it } from "vitest";
import { lireRequeteBornee } from "./requete-bornee";

const URL_MCP = "http://localhost/api/mcp";

function requete(corps: BodyInit | null, entetes: Record<string, string> = {}): Request {
  return new Request(URL_MCP, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer x", ...entetes },
    body: corps,
  });
}

/** Corps envoyé en flux, par morceaux, sans longueur annoncée. */
function flux(morceaux: string[]): ReadableStream<Uint8Array> {
  const encodeur = new TextEncoder();
  return new ReadableStream({
    start(controleur) {
      for (const morceau of morceaux) controleur.enqueue(encodeur.encode(morceau));
      controleur.close();
    },
  });
}

describe("lireRequeteBornee", () => {
  it("reconstruit une requête identique dont le corps se relit, en-têtes gardés", async () => {
    const lue = await lireRequeteBornee(requete('{"jsonrpc":"2.0"}'), 100);
    expect(lue).not.toBeNull();
    expect(lue?.method).toBe("POST");
    expect(lue?.url).toBe(URL_MCP);
    expect(lue?.headers.get("authorization")).toBe("Bearer x");
    expect(lue?.headers.get("content-length")).toBe("17");
    expect(await lue?.clone().json()).toEqual({ jsonrpc: "2.0" });
    expect(await lue?.text()).toBe('{"jsonrpc":"2.0"}');
  });

  it("accepte un corps en flux tant qu'il reste sous la borne, sans transfer-encoding", async () => {
    const lue = await lireRequeteBornee(
      new Request(URL_MCP, {
        method: "POST",
        headers: { "transfer-encoding": "chunked" },
        body: flux(["abc", "def"]),
        duplex: "half",
      } as RequestInit),
      6,
    );
    expect(await lue?.text()).toBe("abcdef");
    expect(lue?.headers.get("transfer-encoding")).toBeNull();
  });

  it("refuse un corps annoncé au-delà de la borne sans le lire", async () => {
    expect(await lireRequeteBornee(requete("x".repeat(20), { "content-length": "20" }), 10)).toBeNull();
  });

  it("refuse un corps en flux qui dépasse la borne, même sans longueur annoncée", async () => {
    const trop = new Request(URL_MCP, {
      method: "POST",
      body: flux(["abcd", "efgh", "ijkl"]),
      duplex: "half",
    } as RequestInit);
    expect(await lireRequeteBornee(trop, 10)).toBeNull();
  });

  it("laisse passer une requête sans corps", async () => {
    const sansCorps = new Request(URL_MCP, { method: "GET" });
    expect(await lireRequeteBornee(sansCorps, 10)).toBe(sansCorps);
  });
});
