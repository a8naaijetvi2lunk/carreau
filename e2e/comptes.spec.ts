import { expect, test } from "@playwright/test";
import { creerLienSuperAdmin } from "./outils/comptes";
import { codeHotp, codeTotp, decoderBase32 } from "./outils/totp";
import { activerEtEnroler, alerte, MOT_DE_PASSE } from "./outils/parcours";

test.describe("comptes", () => {
  test("l'outil TOTP suit les RFC 4648 et 4226", () => {
    expect(Array.from(decoderBase32("AEBAGBAF"))).toEqual([1, 2, 3, 4, 5]);
    expect(codeHotp(new Uint8Array(Buffer.from("12345678901234567890", "ascii")), 1)).toBe("287082");
  });

  test("un super-admin invite un enseignant, qui active son compte avec la double authentification", async ({
    page,
  }, testInfo) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
        violations.push(message.text());
      }
    });
    const suffixe = testInfo.project.name;
    const emailEnseignant = `enseignant-${suffixe}@exemple.fr`;

    // 1. Le super-admin, créé par script, active son compte et enrôle son TOTP.
    await page.goto(creerLienSuperAdmin(`super-admin-${suffixe}@exemple.fr`));
    // Une erreur de saisie garde le prénom et le nom ; les mots de passe repartent vides (D9 du lot 10).
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Activer mon compte");
    await page.getByLabel("Prénom", { exact: true }).fill("Yves");
    await page.getByLabel("Nom", { exact: true }).fill("Charvis");
    await page.getByLabel("Mot de passe", { exact: true }).fill(MOT_DE_PASSE);
    await page.getByLabel("Confirmation du mot de passe", { exact: true }).fill(`${MOT_DE_PASSE} bis`);
    await page.getByRole("button", { name: "Activer mon compte" }).click();
    await expect(page.getByText("Les deux mots de passe ne correspondent pas.")).toBeVisible();
    await expect(page.getByLabel("Prénom", { exact: true })).toHaveValue("Yves");
    await expect(page.getByLabel("Nom", { exact: true })).toHaveValue("Charvis");
    await expect(page.getByLabel("Mot de passe", { exact: true })).toHaveValue("");
    await activerEtEnroler(page, { prenom: "Yves", nom: "Charvis" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bonjour Yves");
    await expect(alerte(page)).toContainText("Renseigne les durées de conservation");

    // 2. Il invite un enseignant : l'envoi n'est pas configuré, le lien est affiché.
    await page.getByRole("link", { name: "Enseignants" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Enseignants");
    await page.getByLabel("Email", { exact: true }).fill(emailEnseignant);
    await page.getByRole("button", { name: "Envoyer l’invitation" }).click();
    await expect(page.getByText(`Invitation créée pour ${emailEnseignant}.`)).toBeVisible();
    const lien = await page.getByLabel("Lien d’invitation").inputValue();
    expect(lien).toMatch(/\/activation\/[A-Za-z0-9_-]{43}$/);

    // 3. Déconnexion ; l'enseignant ouvre son lien et active son compte.
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page).toHaveURL(/\/connexion$/);
    await page.goto(lien);
    const secret = await activerEtEnroler(page, { prenom: "Claire", nom: "Arnaud" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bonjour Claire");
    await expect(page.getByRole("link", { name: "Enseignants" })).toHaveCount(0);

    // 4. L'administration lui est fermée : 404.
    const reponse = await page.goto("/admin/enseignants");
    expect(reponse?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page introuvable");

    // 5. Le lien d'invitation ne sert qu'une fois.
    await page.goto(lien);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lien inutilisable");

    // 6. Reconnexion : mot de passe faux refusé, puis bon mot de passe et code du pas suivant (anti-rejeu).
    await page.goto("/enseignant");
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page).toHaveURL(/\/connexion$/);
    await page.getByLabel("Adresse email", { exact: true }).fill(emailEnseignant);
    await page.getByLabel("Mot de passe", { exact: true }).fill("mauvais mot de passe");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(alerte(page)).toHaveText("Adresse email ou mot de passe incorrect.");
    await page.getByLabel("Mot de passe", { exact: true }).fill(MOT_DE_PASSE);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/connexion\/double-authentification$/);
    await page.getByLabel("Code à 6 chiffres", { exact: true }).fill(codeTotp(secret, 1));
    await page.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bonjour Claire");

    expect(violations).toEqual([]);
  });

  test("mot de passe oublié : même réponse pour une adresse inconnue", async ({ page }) => {
    await page.goto("/mot-de-passe-oublie");
    await page.getByLabel("Adresse email", { exact: true }).fill("personne@exemple.fr");
    await page.getByRole("button", { name: "Envoyer le lien" }).click();
    await expect(page.getByRole("status")).toContainText("Si un compte correspond à cette adresse");
  });

  test("une page de l'espace connecté renvoie vers la connexion sans session", async ({ page }) => {
    await page.goto("/admin/parametres");
    await expect(page).toHaveURL(/\/connexion$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Connexion");
  });
});
