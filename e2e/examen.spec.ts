/**
 * Examen complet (lot 5, livrable du spec §14) : trois téléphones passent un QCM de trois questions en
 * chrono par question. Léa répond juste, Sacha en partie, Hugo ne touche à rien et ses questions
 * échoient. Tout est noté, et la session se termine sans intervention de l'enseignante.
 */
import { expect, test, type Page } from "@playwright/test";
import {
  creerSessionPour,
  effacerParametres,
  lireCode,
  nouveauTelephone,
  preparerEnseignante,
  preparerQcmExpress,
  QCM_EXPRESS,
  rejoindre,
} from "./outils/sessions";

/** Réponses à cocher, par énoncé : questions et réponses sont mélangées pour chaque étudiant. */
type Reponses = Record<string, string[]>;

const JUSTES: Reponses = {
  "Capitale de la France ?": ["Paris"],
  "Nombres pairs ?": ["Deux", "Quatre"],
  "Le ciel est vert.": ["Faux"],
};

/** Juste, puis une seule des deux bonnes réponses (tout ou rien : 0), puis faux : 1 / 3, soit 6,67 / 20. */
const EN_PARTIE: Reponses = {
  "Capitale de la France ?": ["Paris"],
  "Nombres pairs ?": ["Deux"],
  "Le ciel est vert.": ["Vrai"],
};

async function repondre(telephone: Page, reponses: Reponses): Promise<void> {
  for (let rang = 1; rang <= 3; rang += 1) {
    const question = telephone.locator(`[data-etat="question"][data-rang="${rang}"]`);
    await expect(question).toBeVisible({ timeout: 20_000 });
    const enonce = (await question.getByRole("heading", { level: 2 }).textContent()) ?? "";
    const aCocher = reponses[enonce];
    if (!aCocher) throw new Error(`Énoncé inattendu : ${enonce}`);
    for (const texte of aCocher) await question.getByRole("button", { name: texte }).click();
    await question.getByRole("button", { name: "Valider et continuer" }).click();
  }
}

test.describe("examen", () => {
  test.afterAll(async () => {
    await effacerParametres();
  });

  test("examen complet : trois téléphones notés sans intervention", async ({ page, browser }, testInfo) => {
    test.skip(testInfo.project.name !== "ordinateur", "Parcours long : joué sur ordinateur seulement.");
    test.setTimeout(300_000);
    await preparerEnseignante(page, "examen-complet@exemple.fr");
    await preparerQcmExpress(page);
    await creerSessionPour(page, QCM_EXPRESS);

    const lea = await nouveauTelephone(browser, "iPhone 15");
    const sacha = await nouveauTelephone(browser, "Pixel 7");
    const hugo = await nouveauTelephone(browser, "Pixel 7");
    const telephones = [lea, sacha, hugo];
    const violations: string[] = [];
    for (const t of telephones) {
      t.page.on("console", (message) => {
        if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
          violations.push(message.text());
        }
      });
    }
    await rejoindre(lea.page, await lireCode(page), "DUPONT", "Léa");
    await rejoindre(sacha.page, await lireCode(page), "DUPRÉ", "Sacha");
    await rejoindre(hugo.page, await lireCode(page), "DUPUIS", "Hugo");
    await expect(page.getByRole("heading", { name: "Dans la salle · 3 / 30" })).toBeVisible();

    await page.getByRole("button", { name: "Démarrer l’examen" }).click();
    await page.getByRole("button", { name: "Démarrer maintenant" }).click();

    // Hugo ne touche à rien : ses questions échoient l'une après l'autre (10 s, plus 3 s de tolérance).
    await Promise.all([repondre(lea.page, JUSTES), repondre(sacha.page, EN_PARTIE)]);

    await expect(lea.page.getByRole("heading", { level: 1 })).toHaveText("Examen terminé");
    await expect(lea.page.getByText("3 / 3", { exact: true })).toBeVisible();
    await expect(lea.page.getByText("20 / 20", { exact: true })).toBeVisible();
    await expect(sacha.page.getByRole("heading", { level: 1 })).toHaveText("Examen terminé");
    await expect(sacha.page.getByText("6,67 / 20", { exact: true })).toBeVisible();

    await expect(hugo.page.getByRole("heading", { level: 1 })).toHaveText("Examen terminé", {
      timeout: 90_000,
    });
    await expect(hugo.page.getByText("0 / 3", { exact: true })).toBeVisible();
    await expect(hugo.page.getByText("0 / 20", { exact: true })).toBeVisible();

    // L'enseignante n'a rien fait : chaque participant est « Terminé », la session « Terminée ».
    const salle = page.getByRole("region", { name: /^Dans la salle/ });
    await expect(salle.getByText("Terminé", { exact: true })).toHaveCount(3, { timeout: 15_000 });
    await expect(page.getByText("Terminée", { exact: true }).first()).toBeVisible();

    expect(violations).toEqual([]);
    for (const t of telephones) {
      expect(await t.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
        true,
      );
    }
    await Promise.all(telephones.map((t) => t.contexte.close()));
  });
});
