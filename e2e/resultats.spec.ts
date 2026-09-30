/**
 * Résultats (lot 7, livrable du spec §14 et fin du scénario du spec §13) : trois téléphones passent
 * l'examen par défaut ; Léa répond juste aux deux questions, Hugo copie. L'enseignante termine
 * l'examen, ouvre les résultats, publie la correction (Léa la voit sur son téléphone), exporte le CSV
 * et le classeur Excel (relus), ouvre le rapport de Hugo, puis crée un rattrapage pour Louis André,
 * absent, qui le passe : sa ligne rejoint le tableau, marquée « Rattrapage ».
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import readXlsxFile from "read-excel-file/node";
import {
  choisirNom,
  creerSession,
  effacerParametres,
  entrerEnSalle,
  lireCode,
  nouveauTelephone,
  preparerEnseignante,
  rejoindre,
  scanner,
} from "./outils/sessions";

/** Bonnes réponses du QCM de `preparerEnseignante`, par énoncé. */
const REPONSES_JUSTES: Record<string, string> = {
  "Quelle est la complexité d’une boucle simple sur n éléments ?": "O(n)",
  "Une pile suit l’ordre FIFO.": "Faux",
};

test.describe("résultats", () => {
  test.afterAll(async () => {
    await effacerParametres();
  });

  test("export XLSX conforme, rapport avec détail de l'indice, correction et rattrapage", async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "ordinateur", "Parcours long : joué sur ordinateur seulement.");
    test.setTimeout(300_000);
    await preparerEnseignante(page, "resultats@exemple.fr");
    const sessionId = await creerSession(page);

    const lea = await nouveauTelephone(browser, "iPhone 15");
    const sacha = await nouveauTelephone(browser, "Pixel 7");
    const hugo = await nouveauTelephone(browser, "Pixel 7");
    const louis = await nouveauTelephone(browser, "Pixel 7");
    const telephones = [lea, sacha, hugo, louis];
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
    await page.getByRole("button", { name: "Démarrer l’examen" }).click();
    await page.getByRole("button", { name: "Démarrer maintenant" }).click();
    for (const t of [lea, sacha, hugo]) {
      await expect(t.page.locator('[data-etat="question"][data-rang="1"]')).toBeVisible({ timeout: 20_000 });
    }

    // Léa répond juste aux deux questions ; Hugo copie pendant sa première question.
    for (let rang = 1; rang <= 2; rang += 1) {
      const question = lea.page.locator(`[data-etat="question"][data-rang="${rang}"]`);
      await expect(question).toBeVisible({ timeout: 20_000 });
      const enonce = (await question.getByRole("heading", { level: 2 }).textContent()) ?? "";
      const texte = REPONSES_JUSTES[enonce];
      if (!texte) throw new Error(`Énoncé inattendu : ${enonce}`);
      const choisie = question.getByRole("group", { name: "Réponses" }).getByRole("button", { name: texte });
      await choisie.click();
      await expect(choisie).toHaveAttribute("aria-pressed", "true");
      await lea.page.waitForTimeout(1_500);
      await question.getByRole("button", { name: "Valider et continuer" }).click();
    }
    await expect(lea.page.getByRole("heading", { level: 1 })).toHaveText("Examen terminé");
    await hugo.page.evaluate(() => document.dispatchEvent(new Event("copy")));
    const suivi = page.getByRole("region", { name: "Suivi des étudiants" });
    await expect(suivi.locator('[data-etudiant="DUPUIS Hugo"]')).toContainText("Copier-coller", {
      timeout: 15_000,
    });

    // Fin pour tous, puis les résultats.
    await page.getByRole("button", { name: "Terminer pour tous", exact: true }).click();
    await page.getByRole("button", { name: "Oui, terminer pour tous", exact: true }).click();
    for (const t of [sacha, hugo]) {
      await expect(t.page.getByRole("heading", { level: 1 })).toHaveText("Examen terminé", {
        timeout: 20_000,
      });
    }
    await page.getByRole("link", { name: "Voir les résultats" }).click();
    await expect(page).toHaveURL(new RegExp(`/enseignant/resultats/${sessionId}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Algorithmique — Contrôle 2");
    const statistiques = page.getByRole("region", { name: "Statistiques" });
    await expect(statistiques).toContainText("3 / 30");
    const etudiants = page.getByRole("region", { name: /^Étudiants/ });
    const ligne = (nom: string) => etudiants.locator(`[data-etudiant="${nom}"]`);
    await expect(ligne("DUPONT Léa")).toContainText("20");
    await expect(ligne("DUPONT Léa")).toContainText("2 / 2");
    await expect(ligne("DUPUIS Hugo").getByLabel(/^Indice \d+ sur 100$/)).toBeVisible();
    await expect(etudiants).toContainText("Ce n’est pas une preuve.");

    // La correction publiée apparaît sur le téléphone de Léa (écran de fin relu toutes les 15 s).
    const interrupteur = page.getByRole("button", { name: "Correction visible" });
    await expect(interrupteur).toHaveAttribute("aria-pressed", "false");
    await interrupteur.click();
    await expect(interrupteur).toHaveAttribute("aria-pressed", "true");
    const voir = lea.page.getByRole("button", { name: "Voir la correction" });
    await expect(voir).toBeVisible({ timeout: 25_000 });
    await voir.click();
    const correction = lea.page.getByRole("region", { name: "Correction" });
    await expect(correction.getByText("Bonne réponse", { exact: true })).toHaveCount(2);
    await expect(correction.getByText("Ta réponse", { exact: true })).toHaveCount(2);

    // Export CSV : BOM, « ; », la ligne de Léa.
    const [csv] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Exporter en CSV" }).click(),
    ]);
    expect(csv.suggestedFilename()).toMatch(/^resultats-algorithmique-controle-2-\d{4}-\d{2}-\d{2}\.csv$/);
    const texteCsv = readFileSync(await csv.path(), "utf8");
    expect(texteCsv.charCodeAt(0)).toBe(0xfeff);
    expect(texteCsv).toContain("Nom;Prénom;Tiers-temps;Passage;Statut;Note sur 20;Points;Bonnes réponses");
    expect(texteCsv).toMatch(/\r\nDUPONT;Léa;Non;Session;Présent;20;2;2;/);

    // Export Excel conforme (spec §14) : une feuille de synthèse, une feuille par question.
    const [xlsx] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Exporter en Excel" }).click(),
    ]);
    expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
    const feuilles = await readXlsxFile(readFileSync(await xlsx.path()));
    expect(feuilles.map((f) => f.sheet)).toEqual(["Synthèse", "Q1", "Q2"]);
    const synthese = feuilles[0]?.data ?? [];
    expect(synthese[0]?.slice(0, 3)).toEqual(["Nom", "Prénom", "Tiers-temps"]);
    expect(synthese).toHaveLength(31);
    expect(synthese.find((l) => l[0] === "DUPONT")?.slice(0, 8)).toEqual([
      "DUPONT",
      "Léa",
      "Non",
      "Session",
      "Présent",
      20,
      2,
      2,
    ]);
    expect(feuilles[1]?.data.find((l) => l[0] === "DUPONT")?.slice(0, 5)).toEqual([
      "DUPONT",
      "Léa",
      "B",
      "Juste",
      1,
    ]);

    // Rapport de Hugo : le détail de l'indice compte le copier-coller (spec §14).
    await ligne("DUPUIS Hugo").getByRole("link", { name: "Voir le rapport" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("DUPUIS Hugo");
    const detail = page.getByRole("region", { name: "Détail de l’indice" });
    await expect(detail).toContainText("Copier, couper ou coller");
    await expect(detail).toContainText("+10");
    const chronologie = page.getByRole("region", { name: "Chronologie" });
    await expect(chronologie).toContainText("Début de l’examen");
    await expect(chronologie).toContainText("Copier-coller");
    await expect(page.getByRole("region", { name: "Évolution" })).toContainText("Algorithmique — Contrôle 2");
    await expect(page.getByText(/Ce n’est pas une preuve : à croiser/)).toBeVisible();

    // Rattrapage de Louis André, absent : il ne voit que son nom, passe l'examen, rejoint le tableau.
    await page.getByRole("link", { name: /^← Résultats/ }).click();
    await ligne("ANDRÉ Louis").getByRole("button", { name: "Créer un rattrapage" }).click();
    const panneau = page.getByRole("region", { name: "Nouveau rattrapage" });
    await expect(panneau.getByLabel("ANDRÉ Louis", { exact: true })).toBeChecked();
    await panneau.getByRole("button", { name: "Créer le rattrapage" }).click();
    await expect(page).toHaveURL(/\/enseignant\/sessions\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("link", { name: "Résultats de la session d’origine" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dans la salle · 0 / 1" })).toBeVisible();
    await scanner(louis.page, await lireCode(page));
    await louis.page.getByLabel("Ton nom ou ton prénom", { exact: true }).fill("DUPONT");
    await expect(louis.page.getByRole("button", { name: "DUPONT Léa", exact: true })).toHaveCount(0);
    await choisirNom(louis.page, "ANDRÉ", "ANDRÉ Louis");
    await entrerEnSalle(louis.page, "Louis");
    await page.bringToFront();
    await expect(page.getByRole("heading", { name: "Dans la salle · 1 / 1" })).toBeVisible();
    await page.getByRole("button", { name: "Démarrer l’examen" }).click();
    await page.getByRole("button", { name: "Démarrer maintenant" }).click();
    await expect(louis.page.locator('[data-etat="question"][data-rang="1"]')).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Terminer pour tous", exact: true }).click();
    await page.getByRole("button", { name: "Oui, terminer pour tous", exact: true }).click();
    await expect(louis.page.getByRole("heading", { level: 1 })).toHaveText("Examen terminé", {
      timeout: 20_000,
    });
    await page.getByRole("link", { name: "Voir les résultats" }).click();
    await expect(page).toHaveURL(new RegExp(`/enseignant/resultats/${sessionId}$`));
    await expect(ligne("ANDRÉ Louis")).toContainText("Rattrapage");
    await expect(ligne("ANDRÉ Louis").getByRole("link", { name: "Voir le rapport" })).toBeVisible();
    await expect(statistiques).toContainText("4 / 30");

    // La page des résultats tient sur un téléphone, sans défilement horizontal.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(etudiants).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    expect(violations).toEqual([]);
    await Promise.all(telephones.map((t) => t.contexte.close()));
  });
});
