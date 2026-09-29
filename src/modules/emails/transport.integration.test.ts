import { beforeEach, describe, expect, it, vi } from "vitest";
import { transportResend } from "@/modules/emails";

const resend = vi.hoisted(() => ({ envoyer: vi.fn(), cles: [] as string[] }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resend.envoyer };
    constructor(cle: string) {
      resend.cles.push(cle);
    }
  },
}));

const ENVOI = {
  cleApi: "re_test_cle",
  expediteur: '"Carreau" <invitations@exemple.fr>',
  destinataire: "claire@exemple.fr",
  sujet: "Sujet",
  texte: "Texte",
  html: "<p>Texte</p>",
};

beforeEach(() => {
  resend.envoyer.mockReset();
  resend.cles.length = 0;
});

describe("transport Resend", () => {
  it("transmet le message et renvoie l'identifiant de l'email", async () => {
    resend.envoyer.mockResolvedValueOnce({ data: { id: "abc" }, error: null });
    expect(await transportResend(ENVOI)).toEqual({ ok: true, id: "abc" });
    expect(resend.cles).toEqual(["re_test_cle"]);
    expect(resend.envoyer).toHaveBeenCalledWith({
      from: '"Carreau" <invitations@exemple.fr>',
      to: "claire@exemple.fr",
      subject: "Sujet",
      text: "Texte",
      html: "<p>Texte</p>",
    });
  });

  it("lit l'erreur renvoyée par le SDK, qui ne lève pas", async () => {
    resend.envoyer.mockResolvedValueOnce({
      data: null,
      error: { name: "validation_error", message: "Domaine non vérifié", statusCode: 403 },
    });
    expect(await transportResend(ENVOI)).toEqual({
      ok: false,
      nom: "validation_error",
      message: "Domaine non vérifié",
      statut: 403,
    });
  });

  it("convertit une panne réseau en échec", async () => {
    resend.envoyer.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND api.resend.com"));
    expect(await transportResend(ENVOI)).toEqual({
      ok: false,
      nom: "erreur_reseau",
      message: "Resend est injoignable.",
      statut: null,
    });
  });
});
