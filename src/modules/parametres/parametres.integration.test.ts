import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { journal, parametres } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import {
  enregistrerConservation,
  enregistrerEnvoiEmails,
  enregistrerValiditeInvitations,
  lireConfigurationEnvoi,
  lireInformationDonnees,
  lireParametres,
  lireValiditeInvitationJours,
  parametresRgpdComplets,
} from "@/modules/parametres";
import { acteurDe, creerUtilisateur } from "@/test/comptes";

const CLE = "re_AbCdEf12_3456789";

beforeEach(() => definirHorlogePourLesTests(horlogeFixe(Date.parse("2026-09-29T08:00:00.000Z"))));
afterEach(() => {
  definirHorlogePourLesTests();
  vi.restoreAllMocks();
});

async function superAdmin() {
  return acteurDe(await creerUtilisateur({ role: "super_admin" }));
}

describe("droits", () => {
  it.each(["admin", "enseignant"] as const)("refuse les paramètres à un compte %s", async (role) => {
    const acteur = acteurDe(await creerUtilisateur({ role }));
    await expect(lireParametres(acteur)).rejects.toMatchObject({ code: "ACCES_REFUSE" });
    const [entree] = await db()
      .select()
      .from(journal)
      .where(and(eq(journal.action, "acces.refus"), eq(journal.acteurId, acteur.id)));
    expect(entree?.details).toMatchObject({ action: "parametres.lire", role });

    await expect(
      enregistrerEnvoiEmails(acteur, {
        cleApi: CLE,
        emailExpediteur: "a@exemple.fr",
        nomExpediteur: "Carreau",
      }),
    ).rejects.toMatchObject({ code: "ACCES_REFUSE" });
    await expect(
      enregistrerValiditeInvitations(acteur, { validiteInvitationJours: 3 }),
    ).rejects.toMatchObject({
      code: "ACCES_REFUSE",
    });
    await expect(
      enregistrerConservation(acteur, {
        conservationEvenementsJours: 30,
        conservationResultatsJours: 365,
        contactDonnees: "dpo@exemple.fr",
      }),
    ).rejects.toMatchObject({ code: "ACCES_REFUSE" });
  });
});

describe("lecture", () => {
  it("donne les valeurs par défaut tant que rien n'est enregistré", async () => {
    expect(await lireParametres(await superAdmin())).toEqual({
      resendConfiguree: false,
      emailExpediteur: null,
      nomExpediteur: null,
      validiteInvitationJours: 7,
      conservationEvenementsJours: null,
      conservationResultatsJours: null,
      contactDonnees: null,
      rgpdComplet: false,
    });
    expect(await lireValiditeInvitationJours()).toBe(7);
    expect(await parametresRgpdComplets()).toBe(false);
    expect(await lireConfigurationEnvoi()).toBeNull();
  });
});

describe("envoi des emails", () => {
  it("exige une clé la première fois", async () => {
    await expect(
      enregistrerEnvoiEmails(await superAdmin(), {
        cleApi: "",
        emailExpediteur: "invitations@exemple.fr",
        nomExpediteur: "Carreau",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION", message: "Renseigne la clé Resend." });
  });

  it("chiffre la clé, ne la journalise pas et la conserve si le champ est laissé vide", async () => {
    const acteur = await superAdmin();
    await enregistrerEnvoiEmails(acteur, {
      cleApi: ` ${CLE} `,
      emailExpediteur: " Invitations@Exemple.fr ",
      nomExpediteur: " Carreau ",
    });
    const [ligne] = await db().select().from(parametres);
    expect(ligne?.resendCleChiffree?.startsWith("v1.")).toBe(true);
    expect(ligne?.resendCleChiffree).not.toContain(CLE);
    expect(await lireConfigurationEnvoi()).toEqual({
      cleApi: CLE,
      expediteur: '"Carreau" <invitations@exemple.fr>',
    });

    await enregistrerEnvoiEmails(acteur, {
      cleApi: "",
      emailExpediteur: "contact@exemple.fr",
      nomExpediteur: "IUT",
    });
    expect(await lireConfigurationEnvoi()).toEqual({ cleApi: CLE, expediteur: '"IUT" <contact@exemple.fr>' });
    expect((await lireParametres(acteur)).resendConfiguree).toBe(true);

    const entrees = await db().select().from(journal).where(eq(journal.action, "parametres.modifier_envoi"));
    expect(entrees.map((e) => e.details)).toEqual([{ cleRemplacee: true }, { cleRemplacee: false }]);
    expect(JSON.stringify(entrees)).not.toContain(CLE);
  });

  it.each([
    [{ cleApi: "sk_live_x", emailExpediteur: "a@exemple.fr", nomExpediteur: "Carreau" }, "cleApi"],
    [{ cleApi: CLE, emailExpediteur: "pas-une-adresse", nomExpediteur: "Carreau" }, "emailExpediteur"],
    [{ cleApi: CLE, emailExpediteur: "a@exemple.fr", nomExpediteur: 'Car"reau' }, "nomExpediteur"],
    [{ cleApi: CLE, emailExpediteur: "a@exemple.fr", nomExpediteur: "<Carreau>" }, "nomExpediteur"],
    [{ cleApi: CLE, emailExpediteur: "a@exemple.fr", nomExpediteur: " " }, "nomExpediteur"],
  ])("refuse une saisie invalide (%o → %s)", async (saisie, champ) => {
    const erreur = await enregistrerEnvoiEmails(await superAdmin(), saisie).catch((e: unknown) => e);
    expect(erreur).toMatchObject({ code: "VALIDATION" });
    expect((erreur as { details: { chemin: string }[] }).details[0]?.chemin).toBe(champ);
  });

  it("une clé illisible donne une configuration absente, journalisée sans la clé", async () => {
    const acteur = await superAdmin();
    await enregistrerEnvoiEmails(acteur, {
      cleApi: CLE,
      emailExpediteur: "invitations@exemple.fr",
      nomExpediteur: "Carreau",
    });
    await db().update(parametres).set({ resendCleChiffree: "v1.abc.def.ghi" }).where(eq(parametres.id, 1));
    const espion = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await lireConfigurationEnvoi()).toBeNull();
    expect(espion).toHaveBeenCalledTimes(1);
  });
});

describe("validité des invitations", () => {
  it("enregistre une durée de 1 à 30 jours", async () => {
    const acteur = await superAdmin();
    await enregistrerValiditeInvitations(acteur, { validiteInvitationJours: 14 });
    expect(await lireValiditeInvitationJours()).toBe(14);
    const [entree] = await db()
      .select()
      .from(journal)
      .where(eq(journal.action, "parametres.modifier_invitations"));
    expect(entree?.details).toEqual({ validiteInvitationJours: 14 });
  });

  it.each([0, 31, 1.5, Number.NaN])("refuse %s jours", async (jours) => {
    await expect(
      enregistrerValiditeInvitations(await superAdmin(), { validiteInvitationJours: jours }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("conservation des données (RGPD)", () => {
  it("rend les paramètres RGPD complets", async () => {
    const acteur = await superAdmin();
    await enregistrerConservation(acteur, {
      conservationEvenementsJours: 30,
      conservationResultatsJours: 365,
      contactDonnees: "  dpo@exemple.fr ",
    });
    expect(await parametresRgpdComplets()).toBe(true);
    expect(await lireParametres(acteur)).toMatchObject({
      conservationEvenementsJours: 30,
      conservationResultatsJours: 365,
      contactDonnees: "dpo@exemple.fr",
      rgpdComplet: true,
    });
  });

  it.each([
    [{ conservationEvenementsJours: 0, conservationResultatsJours: 365, contactDonnees: "dpo@exemple.fr" }],
    [{ conservationEvenementsJours: 30, conservationResultatsJours: 3651, contactDonnees: "dpo@exemple.fr" }],
    [{ conservationEvenementsJours: 30, conservationResultatsJours: 365, contactDonnees: "  " }],
    [{ conservationEvenementsJours: 30, conservationResultatsJours: 365, contactDonnees: "x".repeat(301) }],
  ])("refuse une saisie invalide (%o)", async (saisie) => {
    await expect(enregistrerConservation(await superAdmin(), saisie)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});

describe("information des étudiants (lot 4)", () => {
  it("ne donne rien tant que la conservation n'est pas renseignée, puis les valeurs réelles", async () => {
    await db().delete(parametres);
    expect(await lireInformationDonnees()).toBeNull();
    const acteurSuperAdmin = acteurDe(await creerUtilisateur({ role: "super_admin" }));
    await enregistrerConservation(acteurSuperAdmin, {
      conservationEvenementsJours: 30,
      conservationResultatsJours: 365,
      contactDonnees: "Direction des études (exemple)",
    });
    expect(await lireInformationDonnees()).toEqual({
      conservationEvenementsJours: 30,
      conservationResultatsJours: 365,
      contact: "Direction des études (exemple)",
    });
  });
});
