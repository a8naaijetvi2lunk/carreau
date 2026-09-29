/** Étapes communes des parcours de bout en bout : activation d'un compte et enrôlement du TOTP. */
import { expect, type Page } from "@playwright/test";
import { codeTotp, secretDepuisUri } from "./totp";

export const MOT_DE_PASSE = "une phrase de passe solide";

/**
 * `role="alert"` hors l'annonceur de route de Next.js (`__next-route-announcer__`, un élément
 * d'accessibilité toujours présent avec ce rôle, distinct de l'alerte de l'application — sinon
 * `getByRole("alert")` résout deux éléments dès qu'une navigation a eu lieu).
 */
export function alerte(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

/** Remplit l'activation puis enrôle le TOTP ; renvoie le secret, pour les codes suivants. */
export async function activerEtEnroler(
  page: Page,
  identite: { prenom: string; nom: string },
): Promise<Uint8Array> {
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
