import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { journal } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import {
  definirTransportEmailPourLesTests,
  envoyerEmail,
  envoyerEmailTest,
  MESSAGE_ENVOI_NON_CONFIGURE,
  MESSAGE_LIMITE_DESTINATAIRE,
} from "@/modules/emails";
import { acteurDe, creerUtilisateur } from "@/test/comptes";
import { capturerEmails, CLE_RESEND_TEST, configurerEnvoi } from "@/test/emails";

const MESSAGE = { sujet: "Sujet", texte: "Texte", html: "<p>Texte</p>" };

beforeEach(() => definirHorlogePourLesTests(horlogeFixe(Date.parse("2026-09-29T08:00:00.000Z"))));
afterEach(() => {
  definirHorlogePourLesTests();
  definirTransportEmailPourLesTests();
});

async function journalDe(action: string) {
  return db().select().from(journal).where(eq(journal.action, action));
}

describe("envoyerEmail", () => {
  it("n'envoie rien tant que l'envoi n'est pas configuré", async () => {
    const envois = capturerEmails();
    expect(
      await envoyerEmail({ destinataire: "rien@exemple.fr", modele: "invitation", message: MESSAGE }),
    ).toEqual({
      ok: false,
      message: MESSAGE_ENVOI_NON_CONFIGURE,
    });
    expect(envois).toEqual([]);
  });

  it("envoie avec la clé et l'expéditeur des paramètres", async () => {
    await configurerEnvoi();
    const envois = capturerEmails();
    expect(
      await envoyerEmail({ destinataire: "claire@exemple.fr", modele: "invitation", message: MESSAGE }),
    ).toEqual({
      ok: true,
    });
    expect(envois).toEqual([
      {
        cleApi: CLE_RESEND_TEST,
        expediteur: '"Carreau" <invitations@exemple.fr>',
        destinataire: "claire@exemple.fr",
        sujet: "Sujet",
        texte: "Texte",
        html: "<p>Texte</p>",
      },
    ]);
  });

  it("limite à 3 envois par heure et par destinataire, casse comprise", async () => {
    await configurerEnvoi();
    const envois = capturerEmails();
    for (const destinataire of ["paul@exemple.fr", "Paul@Exemple.fr", "paul@exemple.fr"]) {
      expect((await envoyerEmail({ destinataire, modele: "invitation", message: MESSAGE })).ok).toBe(true);
    }
    expect(
      await envoyerEmail({ destinataire: "paul@exemple.fr", modele: "invitation", message: MESSAGE }),
    ).toEqual({
      ok: false,
      message: MESSAGE_LIMITE_DESTINATAIRE,
    });
    expect(envois).toHaveLength(3);
    expect(await journalDe("emails.limite")).toHaveLength(1);
    expect(
      (await envoyerEmail({ destinataire: "sophie@exemple.fr", modele: "invitation", message: MESSAGE })).ok,
    ).toBe(true);
  });

  it("journalise un refus de Resend sans l'adresse du destinataire et le remonte", async () => {
    await configurerEnvoi();
    capturerEmails({ ok: false, nom: "validation_error", message: "Domaine non vérifié", statut: 403 });
    expect(
      await envoyerEmail({ destinataire: "julie@exemple.fr", modele: "invitation", message: MESSAGE }),
    ).toEqual({
      ok: false,
      message: "L'email n'a pas pu partir (Resend : Domaine non vérifié).",
    });
    const lignes = await journalDe("emails.echec");
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.details).toEqual({ modele: "invitation", erreur: "validation_error", statut: 403 });
    expect(JSON.stringify(lignes)).not.toContain("julie@exemple.fr");
  });
});

describe("envoyerEmailTest", () => {
  it.each(["admin", "enseignant"] as const)("est refusé à un compte %s", async (role) => {
    const acteur = acteurDe(await creerUtilisateur({ role }));
    await expect(envoyerEmailTest(acteur, { modele: "invitation" })).rejects.toMatchObject({
      code: "ACCES_REFUSE",
    });
    const [entree] = await db()
      .select()
      .from(journal)
      .where(and(eq(journal.action, "acces.refus"), eq(journal.acteurId, acteur.id)));
    expect(entree?.details).toMatchObject({ action: "parametres.email_test", role });
  });

  it("part vers l'adresse du super-admin, sujet préfixé par [Test]", async () => {
    await configurerEnvoi();
    const envois = capturerEmails();
    const u = await creerUtilisateur({ role: "super_admin", email: "yves@exemple.fr" });
    expect(await envoyerEmailTest(acteurDe(u), { modele: "reinitialisation" })).toEqual({ ok: true });
    expect(envois).toHaveLength(1);
    expect(envois[0]?.destinataire).toBe("yves@exemple.fr");
    expect(envois[0]?.sujet).toBe("[Test] Réinitialisation de votre mot de passe Carreau");
    const [ligne] = await journalDe("parametres.email_test");
    expect(ligne?.details).toEqual({ modele: "reinitialisation", ok: true });
  });

  it("refuse un modèle inconnu", async () => {
    const u = await creerUtilisateur({ role: "super_admin" });
    await expect(envoyerEmailTest(acteurDe(u), { modele: "autre" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});
