import { afterEach, describe, expect, it, vi } from "vitest";
import { acteurCourant } from "@/modules/auth";
import { acteurDe, creerUtilisateur } from "@/test/comptes";
import { preparerSession } from "@/test/sessions";
import { POST as projection } from "./[sessionId]/projection/route";
import { POST as suivi } from "./[sessionId]/suivi/route";

vi.mock("@/modules/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/auth")>()),
  acteurCourant: vi.fn(),
}));

afterEach(() => vi.mocked(acteurCourant).mockReset());

function requete(corps = "{}", type = "application/json"): Request {
  return new Request("http://localhost/api/enseignant/sessions/suivi", {
    method: "POST",
    headers: { "content-type": type },
    body: corps,
  });
}

function contexte(sessionId: string) {
  return { params: Promise.resolve({ sessionId }) };
}

describe("routes de suivi de l'enseignant", () => {
  it("refusent un visiteur non connecté (401)", async () => {
    vi.mocked(acteurCourant).mockResolvedValue(null);
    const { session } = await preparerSession();
    expect((await suivi(requete(), contexte(session.id))).status).toBe(401);
    expect((await projection(requete(), contexte(session.id))).status).toBe(401);
  });

  it("donnent le suivi et la projection de sa session, sans cache", async () => {
    const { acteur, session } = await preparerSession();
    vi.mocked(acteurCourant).mockResolvedValue(acteur);
    const r1 = await suivi(requete(), contexte(session.id));
    expect(r1.status).toBe(200);
    expect(r1.headers.get("cache-control")).toBe("no-store");
    await expect(r1.json()).resolves.toMatchObject({ statut: "attente", effectif: 3, participants: [] });
    const r2 = await projection(requete(), contexte(session.id));
    await expect(r2.json()).resolves.toMatchObject({
      statut: "attente",
      connectes: [],
      absents: ["Léa D.", "Sacha D.", "Hugo D."],
    });
  });

  it("répondent 404 pour la session d'un autre compte, 422 sans corps JSON", async () => {
    const { session } = await preparerSession();
    vi.mocked(acteurCourant).mockResolvedValue(acteurDe(await creerUtilisateur()));
    expect((await suivi(requete(), contexte(session.id))).status).toBe(404);
    expect((await projection(requete("", "text/plain"), contexte(session.id))).status).toBe(422);
  });
});
