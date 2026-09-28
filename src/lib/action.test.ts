import { redirect } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executerAction, referenceErreur } from "./action";
import { erreurs } from "./erreurs";

describe("executerAction", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renvoie les données en cas de succès", async () => {
    await expect(executerAction(async () => 42)).resolves.toEqual({ ok: true, donnees: 42 });
  });

  it("convertit une ErreurService en résultat typé", async () => {
    await expect(
      executerAction(async () => {
        throw erreurs.limiteAtteinte("Trop de tentatives.", 30);
      }),
    ).resolves.toEqual({
      ok: false,
      erreur: {
        code: "LIMITE_ATTEINTE",
        message: "Trop de tentatives.",
        details: { reessayerApresSecondes: 30 },
      },
    });
  });

  it("n'ajoute pas de détails absents", async () => {
    await expect(
      executerAction(async () => {
        throw erreurs.conflit("Nom déjà pris.");
      }),
    ).resolves.toEqual({ ok: false, erreur: { code: "CONFLIT", message: "Nom déjà pris." } });
  });

  it("masque une erreur inattendue derrière une référence", async () => {
    const espion = vi.spyOn(console, "error").mockImplementation(() => {});
    const resultat = await executerAction(async () => {
      throw new Error("détail interne");
    });
    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.erreur.code).toBe("INTERNE");
    expect(resultat.erreur.message).toMatch(/^Une erreur inattendue est survenue \(réf\. [0-9A-F]{8}\)$/);
    expect(resultat.erreur.message).not.toContain("détail interne");
    expect(espion).toHaveBeenCalledOnce();
  });

  it("laisse passer les redirections de Next", async () => {
    await expect(executerAction(async () => redirect("/connexion"))).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT/),
    });
  });
});

describe("referenceErreur", () => {
  it("produit 8 caractères hexadécimaux majuscules", () => {
    expect(referenceErreur()).toMatch(/^[0-9A-F]{8}$/);
  });
});
