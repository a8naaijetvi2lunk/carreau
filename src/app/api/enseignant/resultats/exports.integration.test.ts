import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { acteurCourant } from "@/modules/auth";
import { acteurDe, creerUtilisateur } from "@/test/comptes";
import { examenTermine } from "@/test/examen";
import { INSTANT_CODE_TEST } from "@/test/sessions";
import { GET as csv } from "./[sessionId]/csv/route";
import { GET as xlsx } from "./[sessionId]/xlsx/route";

vi.mock("@/modules/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/auth")>()),
  acteurCourant: vi.fn(),
}));

const horloge = horlogeFixe(INSTANT_CODE_TEST);

beforeEach(() => {
  horloge.fixer(INSTANT_CODE_TEST);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => {
  definirHorlogePourLesTests();
  vi.mocked(acteurCourant).mockReset();
});

function contexte(sessionId: string) {
  return { params: Promise.resolve({ sessionId }) };
}

const requete = new Request("http://localhost/api/enseignant/resultats/export");

describe("routes d'export des résultats", () => {
  it("refusent un visiteur non connecté (401) et la session d'un autre compte (404)", async () => {
    const x = await examenTermine(horloge);
    vi.mocked(acteurCourant).mockResolvedValue(null);
    expect((await csv(requete, contexte(x.session.id))).status).toBe(401);
    vi.mocked(acteurCourant).mockResolvedValue(acteurDe(await creerUtilisateur()));
    expect((await xlsx(requete, contexte(x.session.id))).status).toBe(404);
  });

  it("téléchargent le CSV et le classeur Excel, en pièce jointe privée", async () => {
    const x = await examenTermine(horloge);
    vi.mocked(acteurCourant).mockResolvedValue(x.acteur);
    const r1 = await csv(requete, contexte(x.session.id));
    expect(r1.status).toBe(200);
    expect(r1.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(r1.headers.get("content-disposition")).toMatch(
      /^attachment; filename="resultats-algorithmique-controle-2-/,
    );
    expect(r1.headers.get("cache-control")).toBe("private, no-store");
    const r2 = await xlsx(requete, contexte(x.session.id));
    expect(r2.status).toBe(200);
    expect(r2.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    // Un classeur est une archive ZIP : « PK ».
    expect([...new Uint8Array(await r2.arrayBuffer()).slice(0, 2)]).toEqual([0x50, 0x4b]);
  });
});
