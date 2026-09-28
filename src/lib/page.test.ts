import { describe, expect, it } from "vitest";
import { erreurs } from "./erreurs";
import { executerPage } from "./page";

describe("executerPage", () => {
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

  it("relance les autres erreurs", async () => {
    const erreur = erreurs.etat("Session terminée.");
    await expect(
      executerPage(async () => {
        throw erreur;
      }),
    ).rejects.toBe(erreur);
  });
});
