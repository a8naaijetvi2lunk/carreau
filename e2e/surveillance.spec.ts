/**
 * Surveillance (lot 6, livrable du spec §14 et scénario du spec §13) : trois téléphones passent
 * l'examen par défaut (chrono global de 20 min). Léa quitte la page 6 s (visibilité simulée), Hugo
 * copie, Sacha perd le réseau 18 s. Le tableau de bord montre chaque fait avec sa durée ; l'enseignante
 * prolonge l'examen puis le termine pour tous, et vérifie les indices.
 */
import { expect, test, type Page } from "@playwright/test";
import {
  creerSession,
  effacerParametres,
  lireCode,
  nouveauTelephone,
  preparerEnseignante,
  rejoindre,
} from "./outils/sessions";

/** Visibilité de la page simulée (le navigateur de test ne masque jamais un onglet seul). */
async function simulerVisibilite(telephone: Page, etat: "hidden" | "visible"): Promise<void> {
  await telephone.evaluate((valeur) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => valeur });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => valeur === "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  }, etat);
}

test.describe("surveillance", () => {
  test.afterAll(async () => {
    await effacerParametres();
  });

  test("une sortie simulée apparaît dans le tableau de bord avec sa durée", async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "ordinateur", "Parcours long : joué sur ordinateur seulement.");
    test.setTimeout(300_000);
    await preparerEnseignante(page, "surveillance@exemple.fr");
    await creerSession(page);

    const lea = await nouveauTelephone(browser, "iPhone 15");
    const sacha = await nouveauTelephone(browser, "Pixel 7");
    const hugo = await nouveauTelephone(browser, "Pixel 7");
    const telephones = [lea, sacha, hugo];
    const violations: string[] = [];
    for (const t of [page, ...telephones.map((x) => x.page)]) {
      t.on("console", (message) => {
        if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
          violations.push(message.text());
        }
      });
    }
    await rejoindre(lea.page, await lireCode(page), "DUPONT", "Léa");
    await rejoindre(sacha.page, await lireCode(page), "DUPRÉ", "Sacha");
    await rejoindre(hugo.page, await lireCode(page), "DUPUIS", "Hugo");
    await page.bringToFront();
    await expect(page.getByRole("heading", { name: "Dans la salle · 3 / 30" })).toBeVisible();
    await page.getByRole("button", { name: "Démarrer l’examen" }).click();
    await page.getByRole("button", { name: "Démarrer maintenant" }).click();
    for (const t of telephones) {
      await expect(t.page.locator('[data-etat="question"][data-rang="1"]')).toBeVisible({ timeout: 20_000 });
    }

    const tableau = page.getByRole("region", { name: "Suivi des étudiants" });
    const alertes = page.getByRole("region", { name: "Alertes en direct" });
    const ligne = (nom: string) => tableau.locator(`[data-etudiant="${nom}"]`);
    await expect(page.getByRole("timer", { name: "Temps restant" })).toHaveText(/^(19|20):\d{2}$/);

    // Léa quitte la page 6 s : bandeau neutre sur son téléphone, sortie datée au tableau de bord.
    await simulerVisibilite(lea.page, "hidden");
    await lea.page.waitForTimeout(6_000);
    await simulerVisibilite(lea.page, "visible");
    await expect(lea.page.getByText(/^Tu as quitté l’examen pendant \d+ s, c’est noté\./)).toBeVisible({
      timeout: 15_000,
    });
    await expect(ligne("DUPONT Léa")).toContainText(/Sortie \d+ s · Q1 · \d{2}:\d{2}:\d{2}/, {
      timeout: 15_000,
    });
    await expect(alertes).toContainText(/Sortie de l’application · \d+ s/);
    await expect(alertes).toContainText("DUPONT Léa — pendant la question 1.");

    // Hugo copie : « Copier-coller » au tableau de bord et en alerte.
    await hugo.page.evaluate(() => document.dispatchEvent(new Event("copy")));
    await expect(ligne("DUPUIS Hugo")).toContainText(/Copier-coller · Q1 · \d{2}:\d{2}:\d{2}/, {
      timeout: 15_000,
    });
    await expect(alertes).toContainText("DUPUIS Hugo — pendant la question 1.");

    // Sacha perd le réseau 18 s : son téléphone le dit, le tableau de bord la voit « Déconnecté »,
    // puis la coupure est reconnue au retour et n'est pas comptée.
    const debutCoupure = Date.now();
    await sacha.contexte.setOffline(true);
    // L'événement est aussi émis à la main : Chromium ne le garantit pas pour une coupure émulée.
    // Un « hors_ligne » en double est ignoré par la consolidation (D4).
    await sacha.page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(sacha.page.getByText("Connexion perdue", { exact: false })).toBeVisible({ timeout: 20_000 });
    await expect(ligne("DUPRÉ Sacha")).toContainText("Déconnecté", { timeout: 25_000 });
    await sacha.page.waitForTimeout(Math.max(0, 18_000 - (Date.now() - debutCoupure)));
    await sacha.contexte.setOffline(false);
    await sacha.page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(ligne("DUPRÉ Sacha")).toContainText(/Réseau perdu · \d{2}:\d{2}:\d{2}/, { timeout: 20_000 });
    await expect(alertes).toContainText("DUPRÉ Sacha — coupure réseau, non comptée dans l’indice.");

    // Prolonger de 5 minutes : le temps restant recule d'autant.
    const temps = page.getByRole("timer", { name: "Temps restant" });
    await expect(temps).toHaveText(/^1\d:\d{2}$/);
    await page.getByRole("button", { name: "Prolonger", exact: true }).click();
    await page.getByRole("button", { name: "+5 min", exact: true }).click();
    await expect(temps).toHaveText(/^2[34]:\d{2}$/, { timeout: 10_000 });

    // Terminer pour tous : chaque téléphone passe à l'écran de fin.
    await page.getByRole("button", { name: "Terminer pour tous", exact: true }).click();
    await page.getByRole("button", { name: "Oui, terminer pour tous", exact: true }).click();
    for (const t of telephones) {
      await expect(t.page.getByRole("heading", { level: 1 })).toHaveText("Examen terminé", {
        timeout: 20_000,
      });
    }
    await expect(tableau.getByText("Terminé", { exact: true })).toHaveCount(3, { timeout: 15_000 });
    await expect(page.getByText("Examen terminé", { exact: true })).toBeVisible();

    // Indices : Léa, une sortie d'environ 6 s ; Hugo, un copier-coller (10) ; Sacha, une coupure (0).
    await expect(ligne("DUPONT Léa").getByLabel(/^Indice [5-9] sur 100$/)).toBeVisible();
    await expect(ligne("DUPUIS Hugo").getByLabel("Indice 10 sur 100", { exact: true })).toBeVisible();
    await expect(ligne("DUPRÉ Sacha").getByLabel("Indice 0 sur 100", { exact: true })).toBeVisible();
    await expect(tableau).toContainText("Ce n’est pas une preuve.");

    // Le tableau de bord tient sur le téléphone de l'enseignante, sans défilement horizontal.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(tableau).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    expect(violations).toEqual([]);
    await Promise.all(telephones.map((t) => t.contexte.close()));
  });
});
