import { expect, test } from "@playwright/test";
import { videoQr } from "./outils/camera";
import { URL_E2E } from "./outils/env";
import { alerte } from "./outils/parcours";

// Caméra factice de Chromium (décision D7 du plan du lot 9) : la vidéo montre le QR code d'un code bien
// formé mais inconnu. Écrite au chargement du fichier, avant le lancement du navigateur.
const VIDEO = videoQr(`${URL_E2E}/rejoindre#ABC234`, "carreau-e2e-scanner.y4m");

test.use({
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${VIDEO}`,
    ],
  },
});

test.describe("scanner", () => {
  // Les options de caméra factice n'existent que pour Chromium (projets « ordinateur » et « android »).
  test.skip(({ browserName }) => browserName !== "chromium", "Caméra factice : Chromium seulement.");

  test("le scanner lit le QR code projeté et envoie le code au serveur", async ({ page }) => {
    await page.goto("/rejoindre");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rejoindre un examen");
    await page.getByRole("button", { name: "Scanner le QR code" }).click();
    await expect(alerte(page)).toHaveText(
      "Code inconnu ou expiré : saisis le code affiché en ce moment au tableau.",
      { timeout: 20_000 },
    );
    await expect(page.getByLabel("Code de la session", { exact: true })).toHaveValue("ABC234");
    await expect(page.locator("video")).toHaveCount(0);
  });

  test("depuis l'accueil, le lien ouvre /rejoindre avec la caméra permise", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Scanner ou saisir le code" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rejoindre un examen");
    await page.getByRole("button", { name: "Scanner le QR code" }).click();
    await expect(alerte(page)).toHaveText(
      "Code inconnu ou expiré : saisis le code affiché en ce moment au tableau.",
      { timeout: 20_000 },
    );
  });

  test("la caméra n'est permise que sur l'écran d'entrée", async ({ request }) => {
    const entree = await request.get("/rejoindre");
    expect(entree.headers()["permissions-policy"]).toBe("camera=(self), microphone=(), geolocation=()");
    const accueil = await request.get("/");
    expect(accueil.headers()["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()");
  });
});
