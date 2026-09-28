import { redirect } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";
import { erreurs } from "./erreurs";
import { executerPage } from "./page";

describe("executerPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renvoie le résultat du service", async () => {
    await expect(executerPage(async () => "ok")).resolves.toBe("ok");
  });

  it("redirige vers la connexion quand l'utilisateur n'est pas connecté", async () => {
    await expect(
      executerPage(async () => {
        throw erreurs.nonConnecte();
      }),
    ).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT;.*;\/connexion;/) });
  });

  it.each([erreurs.introuvable("Session"), erreurs.accesRefuse()])(
    "affiche une page 404 pour une absence ou un refus (%#)",
    async (erreur) => {
      await expect(
        executerPage(async () => {
          throw erreur;
        }),
      ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    },
  );

  it("remplace une erreur inattendue par une erreur qui ne porte que la référence", async () => {
    const espion = vi.spyOn(console, "error").mockImplementation(() => {});
    const erreurSql = Object.assign(new Error("Failed query: select 1 where nom = $1\nparams: Dupont"), {
      query: "select 1 where nom = $1",
      params: ["Dupont"],
    });
    const promesse = executerPage(async () => {
      throw erreurSql;
    });
    await expect(promesse).rejects.toThrow(/^Erreur inattendue pendant l'affichage \(réf\. [0-9A-F]{8}\)$/);
    await expect(promesse).rejects.not.toBe(erreurSql);
    expect(espion).toHaveBeenCalledOnce();
    expect(JSON.stringify(espion.mock.calls)).not.toContain("Dupont");
  });

  it("ne relance pas non plus une ErreurService non gérée par la page", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const erreur = erreurs.etat("Session terminée.");
    const promesse = executerPage(async () => {
      throw erreur;
    });
    await expect(promesse).rejects.not.toBe(erreur);
    await expect(promesse).rejects.toThrow(/^Erreur inattendue pendant l'affichage/);
  });

  it("laisse passer une redirection levée par le service", async () => {
    await expect(executerPage(async () => redirect("/ailleurs"))).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;.*;\/ailleurs;/),
    });
  });
});
