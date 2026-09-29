import { expect, test, type Page } from "@playwright/test";
import { creerLienSuperAdmin } from "./outils/comptes";
import { codeHotp, codeTotp, decoderBase32, secretDepuisUri } from "./outils/totp";

const MOT_DE_PASSE = "une phrase de passe solide";

/**
 * `role="alert"` hors l'annonceur de route de Next.js (`__next-route-announcer__`, un élément
 * d'accessibilité toujours présent avec ce rôle, distinct de l'alerte de l'application — sinon
 * `getByRole("alert")` résout deux éléments dès qu'une navigation a eu lieu).
 */
function alerte(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

/** Remplit l'activation puis enrôle le TOTP ; renvoie le secret, pour les codes suivants. */
async function activerEtEnroler(page: Page, identite: { prenom: string; nom: string }): Promise<Uint8Array> {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Activer mon compte");
  await page.getByLabel("Prénom", { exact: true }).fill(identite.prenom);
  await page.getByLabel("Nom", { exact: true }).fill(identite.nom);
  await page.getByLabel("Mot de passe", { exact: true }).fill(MOT_DE_PASSE);
  await page.getByLabel("Confirmation du mot de passe", { exact: true }).fill(MOT_DE_PASSE);
  await page.getByRole("button", { name: "Activer mon compte" }).click();
  await expect(page).toHaveURL(/\/connexion\/double-authentification$/);
  await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
  const uri = await page
    .getByRole("link", { name: "Ouvrir dans l’application d’authentification" })
    .getAttribute("href");
  const secret = secretDepuisUri(uri ?? "");
  await page.getByLabel("Code à 6 chiffres", { exact: true }).fill(codeTotp(secret));
  await page.getByRole("button", { name: "Valider" }).click();
  return secret;
}

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
