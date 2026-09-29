import { expect, test, type Page } from "@playwright/test";
import { creerLienSuperAdmin } from "./outils/comptes";
import { imagePng } from "./outils/images";
import { activerEtEnroler, alerte } from "./outils/parcours";

/** Nouveau compte (super-admin créé par script : tous les rôles ont leurs QCM), connecté. */
async function nouveauCompte(page: Page, email: string, identite: { prenom: string; nom: string }) {
  await page.goto(creerLienSuperAdmin(email));
  await activerEtEnroler(page, identite);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Bonjour ${identite.prenom}`);
}

/** Crée un QCM depuis la navigation principale ; l'éditeur s'ouvre sur la question 1. */
async function creerQcm(page: Page, titre: string) {
  await page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name: "QCM", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("QCM");
  await page.getByLabel("Titre du QCM", { exact: true }).fill(titre);
  await page.getByRole("button", { name: "Créer le QCM" }).click();
  await expect(page).toHaveURL(/\/enseignant\/qcm\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(titre);
  await expect(page.getByRole("heading", { level: 2, name: "Question 1" })).toBeVisible();
}

/** Attend que l'enregistrement automatique ait suivi la dernière saisie. */
async function attendreEnregistrement(page: Page) {
  await expect(page.getByRole("status").filter({ hasText: /^Enregistré à \d{2}:\d{2}$/ })).toBeVisible();
}

function champ(page: Page, libelle: string) {
  return page.getByLabel(libelle, { exact: true });
}

test.describe("qcm", () => {
  test("un enseignant écrit un QCM de trois questions, le passe en « prêt » et le voit en aperçu", async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    const violations: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
        violations.push(message.text());
      }
    });
    await nouveauCompte(page, `qcm-${testInfo.project.name}@exemple.fr`, { prenom: "Claire", nom: "Arnaud" });
    await creerQcm(page, "Algorithmique — Contrôle 2");

    // 1. Question 1 : choix unique, réponse ajoutée, barème négatif.
    await champ(page, "Énoncé").fill("Quelle est la complexité d’une boucle simple sur n éléments ?");
    await champ(page, "Réponse 1").fill("O(1)");
    await champ(page, "Réponse 2").fill("O(n)");
    await page.getByRole("button", { name: "+ Ajouter une réponse" }).click();
    await champ(page, "Réponse 3").fill("O(n²)");
    await champ(page, "Bonne réponse : réponse 2").check();
    await page
      .getByRole("group", { name: "Barème" })
      .getByLabel("Mauvaise réponse", { exact: true })
      .fill("-0,25");
    await attendreEnregistrement(page);
    await expect(page.getByRole("list", { name: "À compléter" })).toHaveCount(0);

    // 2. Question 2 : choix multiples, bloc de code Python et image de l'énoncé.
    await page.getByRole("button", { name: "+ Ajouter une question" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Question 2" })).toBeVisible();
    await page
      .getByRole("group", { name: "Type de question" })
      .getByRole("button", { name: "Choix multiples" })
      .click();
    await champ(page, "Énoncé").fill("Qu’affiche ce programme ?");
    await page.getByRole("button", { name: "Bloc de code" }).click();
    await expect(champ(page, "Langage du code")).toHaveValue("python");
    await expect(champ(page, "Code")).toHaveCSS("font-variant-ligatures", "none");
    await champ(page, "Code").fill("def f(n):\n    return n * 2\n\nprint(f(4))");
    await page
      .getByLabel("Choisir l’image de l’énoncé")
      .setInputFiles({ name: "programme.png", mimeType: "image/png", buffer: await imagePng() });
    const imageEnonce = page.getByRole("img", { name: "Image de l’énoncé" });
    await expect(imageEnonce).toBeVisible();
    await expect
      .poll(() => imageEnonce.evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await champ(page, "Réponse 1").fill("8");
    await champ(page, "Réponse 2").fill("Une erreur");
    await champ(page, "Bonne réponse : réponse 1").check();
    await attendreEnregistrement(page);

    // 3. Question 3 ajoutée : le passage en « prêt » est refusé, la liste dit ce qui manque.
    await page.getByRole("button", { name: "+ Ajouter une question" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Question 3" })).toBeVisible();
    await page.getByRole("button", { name: "Marquer comme prêt" }).click();
    // Écart au plan : un compte super-admin porte en permanence l'alerte « Renseigne les durées de
    // conservation » (bandeau RGPD de src/app/(espace)/layout.tsx), un second role="alert" simultané
    // qu'`alerte(page)` seule ne peut plus distinguer ; on cible ici celle qui porte la liste des refus.
    const refus = alerte(page).filter({ has: page.getByRole("list", { name: "Points à corriger" }) });
    await expect(refus).toContainText("Ce QCM ne peut pas encore passer en « prêt »");
    await expect(page.getByRole("list", { name: "Points à corriger" })).toContainText(
      "Question 3 : L'énoncé est vide.",
    );

    // 4. Question 3 : vrai/faux, liée à la question 2.
    await page
      .getByRole("group", { name: "Type de question" })
      .getByRole("button", { name: "Vrai / Faux" })
      .click();
    await expect(champ(page, "Réponse 1")).toHaveValue("Vrai");
    await expect(champ(page, "Réponse 2")).toHaveValue("Faux");
    await champ(page, "Énoncé").fill("Une pile suit l’ordre FIFO.");
    await champ(page, "Bonne réponse : réponse 2").check();
    await attendreEnregistrement(page);
    await page.getByRole("button", { name: "Lier à la question du dessus" }).click();
    await expect(page.getByText("Liée à la question 2.", { exact: true })).toBeVisible();

    // 5. Le bloc des questions 2 et 3 monte en tête, liaison gardée.
    await page.getByRole("button", { name: "Monter" }).click();
    const questions = page.getByRole("list", { name: "Questions du QCM" }).getByRole("link");
    await expect(questions).toHaveText([
      /^1\s*Qu’affiche ce programme/,
      /^2\s*Une pile suit l’ordre FIFO/,
      /^3\s*Quelle est la complexité/,
    ]);
    await expect(page.getByRole("heading", { level: 2, name: "Question 2" })).toBeVisible();
    await expect(page.getByText("Liée à la question 1.", { exact: true })).toBeVisible();

    // 6. Chrono global de 20 minutes.
    const sections = page.getByRole("navigation", { name: "Sections du QCM" });
    await sections.getByRole("link", { name: "Paramètres" }).click();
    await page.getByLabel("Chrono global", { exact: true }).check();
    await champ(page, "Durée de l’examen (minutes)").fill("20");
    await page.getByRole("button", { name: "Enregistrer les paramètres" }).click();
    await expect(page.getByText("Paramètres enregistrés.")).toBeVisible();

    // 7. Passage en « prêt » : le QCM passe en lecture seule.
    await page.getByRole("button", { name: "Marquer comme prêt" }).click();
    await expect(page.getByText("Prêt", { exact: true })).toBeVisible();
    await sections.getByRole("link", { name: /^Questions/ }).click();
    await expect(champ(page, "Énoncé")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Repasser en brouillon" })).toBeVisible();

    // 8. Aperçu : chrono de départ, code coloré par le serveur, image, réponses sélectionnables.
    // L'onglet « Questions » a rouvert la question 1 : l'aperçu s'ouvre sur elle.
    await page.getByRole("link", { name: "Aperçu étudiant" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Algorithmique — Contrôle 2");
    await expect(page.getByText("Question 1 / 3")).toBeVisible();
    await expect(page.getByText("Plusieurs réponses possibles", { exact: true })).toBeVisible();
    await expect(page.getByRole("timer")).toHaveText("20:00");
    const code = page.getByRole("group", { name: "Code Python" });
    await expect(page.getByRole("group", { name: /^Code / })).toHaveCSS("font-variant-ligatures", "none");
    await expect(code).toContainText("print(f(4))");
    await expect(code.locator("span", { hasText: /^def$/ })).toHaveCSS("color", "rgb(143, 179, 255)");
    const image = page.getByRole("img", { name: "Image de la question" });
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    const reponses = page.getByRole("group", { name: "Réponses" }).getByRole("button");
    await expect(reponses).toHaveCount(2);
    await reponses.first().click();
    await expect(reponses.first()).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("link", { name: "Question suivante" }).click();
    await expect(page.getByText("Question 2 / 3")).toBeVisible();
    await expect(page.getByText("Vrai ou faux", { exact: true })).toBeVisible();

    expect(violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("un QCM de 20 questions passe en « prêt »", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "ordinateur", "Parcours long : joué sur ordinateur seulement.");
    test.setTimeout(300_000);
    await nouveauCompte(page, "qcm-vingt@exemple.fr", { prenom: "Yves", nom: "Martin" });
    await creerQcm(page, "Réseaux — QCM 1");
    for (let numero = 1; numero <= 20; numero++) {
      if (numero > 1) {
        await page.getByRole("button", { name: "+ Ajouter une question" }).click();
        await expect(page.getByRole("heading", { level: 2, name: `Question ${numero}` })).toBeVisible();
      }
      await champ(page, "Énoncé").fill(`Question numéro ${numero} : cette affirmation est-elle juste ?`);
      await champ(page, "Réponse 1").fill("Oui");
      await champ(page, "Réponse 2").fill("Non");
      await champ(page, `Bonne réponse : réponse ${numero % 2 === 0 ? 1 : 2}`).check();
    }
    await attendreEnregistrement(page);
    await expect(page.getByRole("list", { name: "Questions du QCM" }).getByRole("link")).toHaveCount(20);
    await page.getByRole("button", { name: "Marquer comme prêt" }).click();
    await expect(page.getByText("Prêt", { exact: true })).toBeVisible();
    await page
      .getByRole("navigation", { name: "Navigation principale" })
      .getByRole("link", { name: "QCM", exact: true })
      .click();
    await expect(page.getByRole("list", { name: "Mes QCM" }).getByRole("link")).toHaveText([
      /Réseaux — QCM 1\s*20 questions\s*Prêt/,
    ]);
  });
});
