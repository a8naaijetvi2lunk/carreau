import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { journal, utilisateur } from "@/db/schema";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { preparerDoubleAuth, verifierMotDePasse } from "@/modules/auth";
import {
  activerCompte,
  annulerInvitation,
  inviter,
  lireInvitation,
  MESSAGES_INVITATION,
} from "@/modules/comptes";
import { acteurDe, creerUtilisateur, exiger } from "@/test/comptes";

const DEBUT = Date.parse("2026-09-29T08:00:00.000Z");
const JOUR = 24 * 60 * 60 * 1000;
const MOT_DE_PASSE = "une phrase de passe solide";
let horloge: ReturnType<typeof horlogeFixe>;

beforeEach(() => {
  horloge = horlogeFixe(DEBUT);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

let numero = 0;

async function inviterUnCompte(role: "enseignant" | "admin" = "enseignant") {
  numero += 1;
  const superAdmin = acteurDe(await creerUtilisateur({ role: "super_admin" }));
  const email = `invite${numero}@exemple.fr`;
  const emise = await inviter(superAdmin, { email, role });
  return { superAdmin, email, emise, jeton: emise.lien.slice(emise.lien.lastIndexOf("/") + 1) };
}

describe("activerCompte", () => {
  it("crée le compte, consomme l'invitation et mène à l'enrôlement du TOTP", async () => {
    const { email, emise, jeton } = await inviterUnCompte("admin");
    const session = await activerCompte({
      jeton,
      nom: " Benali ",
      prenom: "Karim",
      motDePasse: MOT_DE_PASSE,
    });

    const [compte] = await db().select().from(utilisateur).where(eq(utilisateur.email, email));
    expect(compte).toMatchObject({
      nom: "Benali",
      prenom: "Karim",
      role: "admin",
      actif: true,
      totpSecretChiffre: null,
    });
    expect(await verifierMotDePasse(exiger(compte).motDePasseHash, MOT_DE_PASSE)).toBe(true);
    expect((await lireInvitation(jeton))?.etat).toBe("utilisee");
    expect((await preparerDoubleAuth(session.jeton))?.mode).toBe("enrolement");
    const [entree] = await db().select().from(journal).where(eq(journal.action, "comptes.activer"));
    expect(entree).toMatchObject({
      acteurId: compte?.id,
      details: { role: "admin", invitation: emise.invitationId },
    });
  });

  it("refuse un mot de passe de moins de 12 caractères sans consommer l'invitation", async () => {
    const { jeton } = await inviterUnCompte();
    await expect(
      activerCompte({ jeton, nom: "Arnaud", prenom: "Claire", motDePasse: "trop court" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await lireInvitation(jeton))?.etat).toBe("valide");
  });

  it("refuse une invitation expirée, annulée ou déjà utilisée, avec un message clair", async () => {
    const expiree = await inviterUnCompte();
    horloge.avancer(7 * JOUR);
    await expect(
      activerCompte({ jeton: expiree.jeton, nom: "A", prenom: "B", motDePasse: MOT_DE_PASSE }),
    ).rejects.toMatchObject({ code: "ETAT", message: MESSAGES_INVITATION.expiree });
    horloge.fixer(DEBUT);

    const annulee = await inviterUnCompte();
    await annulerInvitation(annulee.superAdmin, { invitationId: annulee.emise.invitationId });
    await expect(
      activerCompte({ jeton: annulee.jeton, nom: "A", prenom: "B", motDePasse: MOT_DE_PASSE }),
    ).rejects.toMatchObject({ code: "ETAT", message: MESSAGES_INVITATION.annulee });

    const utilisee = await inviterUnCompte();
    await activerCompte({ jeton: utilisee.jeton, nom: "A", prenom: "B", motDePasse: MOT_DE_PASSE });
    await expect(
      activerCompte({ jeton: utilisee.jeton, nom: "A", prenom: "B", motDePasse: MOT_DE_PASSE }),
    ).rejects.toMatchObject({ code: "ETAT", message: MESSAGES_INVITATION.utilisee });
  });

  it("refuse un lien inconnu ou mal formé", async () => {
    await expect(
      activerCompte({ jeton: "A".repeat(43), nom: "A", prenom: "B", motDePasse: MOT_DE_PASSE }),
    ).rejects.toMatchObject({ code: "INTROUVABLE" });
    await expect(
      activerCompte({ jeton: "court", nom: "A", prenom: "B", motDePasse: MOT_DE_PASSE }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("deux activations simultanées du même lien : une seule réussit", async () => {
    const { email, jeton } = await inviterUnCompte();
    const resultats = await Promise.allSettled([
      activerCompte({ jeton, nom: "Masson", prenom: "Julie", motDePasse: MOT_DE_PASSE }),
      activerCompte({ jeton, nom: "Masson", prenom: "Julie", motDePasse: MOT_DE_PASSE }),
    ]);
    expect(resultats.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejet = resultats.find((r) => r.status === "rejected");
    expect(rejet?.status === "rejected" ? rejet.reason : null).toMatchObject({ code: "ETAT" });
    expect(await db().select().from(utilisateur).where(eq(utilisateur.email, email))).toHaveLength(1);
  });

  it("adresse prise entre-temps par un autre compte : conflit explicite", async () => {
    const { email, jeton } = await inviterUnCompte();
    await creerUtilisateur({ email });
    await expect(
      activerCompte({ jeton, nom: "Masson", prenom: "Julie", motDePasse: MOT_DE_PASSE }),
    ).rejects.toMatchObject({ code: "CONFLIT" });
  });
});
