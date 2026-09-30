/**
 * Captures du README (tâche 17, demande d'Yves pendant le lot 3) : `npm run build` puis
 * `npm run captures`. Compte enseignant fictif, classe importée, QCM de quatre questions,
 * aperçu sur téléphone, puis une session : six téléphones dans la salle d'attente et un
 * septième qui demande un nom déjà pris ; puis l'examen : une question avec du code et l'écran
 * de fin sur le téléphone de Léa. Données fictives (`@exemple.fr`). Ne tourne jamais
 * avec `npm run test:e2e` (voir playwright.captures.config.ts).
 */
import { devices, expect, test, type Page } from "@playwright/test";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { creerLienSuperAdmin } from "../outils/comptes";
import { URL_E2E } from "../outils/env";
import { ETUDIANTS, listeTd2Csv } from "../outils/listes";
import { activerEtEnroler } from "../outils/parcours";
import { choisirNom, lireCode, nouveauTelephone, rejoindre, scanner } from "../outils/sessions";
import { graphiquePng } from "./graphique";

const DOSSIER_CAPTURES = path.resolve("docs/captures");

/** Vide docs/captures des anciens .png, pour qu'une capture renommée ne reste pas en double. */
function viderCaptures(): void {
  mkdirSync(DOSSIER_CAPTURES, { recursive: true });
  for (const nom of readdirSync(DOSSIER_CAPTURES)) {
    if (nom.endsWith(".png")) rmSync(path.join(DOSSIER_CAPTURES, nom));
  }
}

function capture(nom: string): string {
  return path.join(DOSSIER_CAPTURES, `${nom}.png`);
}

function champ(page: Page, libelle: string) {
  return page.getByLabel(libelle, { exact: true });
}

/** Attend que l'enregistrement automatique ait suivi la dernière saisie. */
async function attendreEnregistrement(page: Page) {
  await expect(page.getByRole("status").filter({ hasText: /^Enregistré à \d{2}:\d{2}$/ })).toBeVisible();
}

/** Aucune barre de défilement horizontale, sur la page actuelle. */
async function sansDefilementHorizontal(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

/** Capture le haut de la page, sans le défilement laissé par les saisies précédentes. */
async function capturerHautDePage(page: Page, nom: string, hauteur = 900) {
  await page.setViewportSize({ width: 1440, height: hauteur });
  await page.evaluate(() => window.scrollTo(0, 0));
  await sansDefilementHorizontal(page);
  await page.screenshot({ path: capture(nom) });
  await page.setViewportSize({ width: 1440, height: 900 });
}

test("captures du README", async ({ page, browser }) => {
  test.setTimeout(180_000);
  viderCaptures();

  // 1. Super-admin fictif : conservation des données renseignée (le bandeau RGPD ne doit apparaître
  // sur aucune capture, et le contact est celui qui figurera sur l'écran d'information des étudiants).
  await page.goto(creerLienSuperAdmin("direction@exemple.fr"));
  await activerEtEnroler(page, { prenom: "Yves", nom: "Martin" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bonjour Yves");

  await page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name: "Paramètres", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Paramètres");
  const conservation = page.getByRole("region", { name: "Conservation des données" });
  await conservation.getByLabel("Événements enregistrés (jours)", { exact: true }).fill("30");
  await conservation.getByLabel("Résultats et notes (jours)", { exact: true }).fill("365");
  await conservation
    .getByLabel("Contact affiché aux étudiants", { exact: true })
    .fill("Direction des études, IUT (exemple)");
  await conservation.getByRole("button", { name: "Enregistrer" }).click();
  await expect(conservation.getByText("Conservation des données enregistrée.")).toBeVisible();

  // 2. Enseignante fictive : invitation, lien affiché (l'envoi n'est pas configuré), activation.
  await page.getByRole("link", { name: "Enseignants" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Enseignants");
  await page.getByLabel("Email", { exact: true }).fill("claire.arnaud@exemple.fr");
  await page.getByRole("button", { name: "Envoyer l’invitation" }).click();
  await expect(page.getByText("Invitation créée pour claire.arnaud@exemple.fr.")).toBeVisible();
  const lienInvitation = await page.getByLabel("Lien d’invitation").inputValue();

  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/connexion$/);
  await page.goto(lienInvitation);
  await activerEtEnroler(page, { prenom: "Claire", nom: "Arnaud" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bonjour Claire");
  // Compte enseignant, non administrateur : le menu ne montre pas l'administration.
  await expect(page.getByRole("link", { name: "Enseignants" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Paramètres", exact: true })).toHaveCount(0);

  // 3. Classe « TD2 », liste de 30 étudiants importée.
  await page.getByRole("link", { name: "Classes", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Classes");
  await page.getByLabel("Nom de la classe", { exact: true }).fill("TD2");
  await page.getByRole("button", { name: "Créer la classe" }).click();
  await expect(page).toHaveURL(/\/enseignant\/classes\/[0-9a-f-]{36}$/);
  await page
    .getByLabel("Fichier de la liste")
    .setInputFiles({ name: "td2.csv", mimeType: "text/csv", buffer: listeTd2Csv() });
  await page.getByRole("button", { name: "Voir l’aperçu" }).click();
  await expect(page.getByText("30 étudiants à ajouter · 2 lignes rejetées")).toBeVisible();
  await page.getByRole("button", { name: "Importer 30 étudiants" }).click();
  await expect(page.getByText("Import enregistré : 30 étudiants ajoutés.")).toBeVisible();

  await capturerHautDePage(page, "classes");

  // 4. QCM « Algorithmique — Contrôle 2 », quatre questions.
  await page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name: "QCM", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("QCM");
  await page.getByLabel("Titre du QCM", { exact: true }).fill("Algorithmique — Contrôle 2");
  await page.getByRole("button", { name: "Créer le QCM" }).click();
  await expect(page).toHaveURL(/\/enseignant\/qcm\/[0-9a-f-]{36}$/);
  const correspondanceQcmId = /\/enseignant\/qcm\/([0-9a-f-]{36})$/.exec(page.url());
  if (!correspondanceQcmId) throw new Error(`Identifiant du QCM introuvable dans l'URL : ${page.url()}`);
  const qcmId = correspondanceQcmId[1];
  await expect(page.getByRole("heading", { level: 2, name: "Question 1" })).toBeVisible();

  // Q1 : choix unique, quatre réponses, barème négatif.
  await champ(page, "Énoncé").fill("Quelle est la complexité d’une boucle simple sur n éléments ?");
  await champ(page, "Réponse 1").fill("O(1)");
  await champ(page, "Réponse 2").fill("O(n)");
  await page.getByRole("button", { name: "+ Ajouter une réponse" }).click();
  await champ(page, "Réponse 3").fill("O(n²)");
  await page.getByRole("button", { name: "+ Ajouter une réponse" }).click();
  await champ(page, "Réponse 4").fill("O(log n)");
  await champ(page, "Bonne réponse : réponse 2").check();
  await page
    .getByRole("group", { name: "Barème" })
    .getByLabel("Mauvaise réponse", { exact: true })
    .fill("-0,25");
  await attendreEnregistrement(page);

  // Q2 : choix multiples, bloc de code Python.
  await page.getByRole("button", { name: "+ Ajouter une question" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Question 2" })).toBeVisible();
  await page
    .getByRole("group", { name: "Type de question" })
    .getByRole("button", { name: "Choix multiples" })
    .click();
  await champ(page, "Énoncé").fill("Qu’affiche ce programme ?");
  await page.getByRole("button", { name: "Bloc de code" }).click();
  await expect(champ(page, "Langage du code")).toHaveValue("python");
  await champ(page, "Code").fill(
    "def f(n):\n    if n <= 1:\n        return 1\n    return n * f(n - 1)\n\nprint(f(4))",
  );
  await champ(page, "Réponse 1").fill("10");
  await champ(page, "Réponse 2").fill("24");
  await page.getByRole("button", { name: "+ Ajouter une réponse" }).click();
  await champ(page, "Réponse 3").fill("16");
  await page.getByRole("button", { name: "+ Ajouter une réponse" }).click();
  await champ(page, "Réponse 4").fill("Une erreur RecursionError");
  await champ(page, "Bonne réponse : réponse 2").check();
  await attendreEnregistrement(page);

  // Capture de l'éditeur ouvert sur la question 2 (titre, liste, question entière), hauteur utile plafonnée.
  const hauteurEditeur = Math.min(await page.evaluate(() => document.documentElement.scrollHeight), 1600);
  await capturerHautDePage(page, "editeur-qcm", hauteurEditeur);

  // Q3 : choix unique avec image d'énoncé.
  await page.getByRole("button", { name: "+ Ajouter une question" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Question 3" })).toBeVisible();
  await page
    .getByRole("group", { name: "Type de question" })
    .getByRole("button", { name: "Choix unique" })
    .click();
  await champ(page, "Énoncé").fill("Quel graphique montre une fonction croissante sur [0 ; 5] ?");
  await page
    .getByLabel("Choisir l’image de l’énoncé")
    .setInputFiles({ name: "graphique.png", mimeType: "image/png", buffer: await graphiquePng() });
  const imageEnonce = page.getByRole("img", { name: "Image de l’énoncé" });
  await expect(imageEnonce).toBeVisible();
  await expect
    .poll(() => imageEnonce.evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await champ(page, "Réponse 1").fill("Le graphique A");
  await champ(page, "Réponse 2").fill("Le graphique B");
  await page.getByRole("button", { name: "+ Ajouter une réponse" }).click();
  await champ(page, "Réponse 3").fill("Aucun des deux");
  await champ(page, "Bonne réponse : réponse 1").check();
  await attendreEnregistrement(page);

  // Q4 : vrai/faux, liée à la question du dessus.
  await page.getByRole("button", { name: "+ Ajouter une question" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Question 4" })).toBeVisible();
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
  await expect(page.getByText("Liée à la question 3.", { exact: true })).toBeVisible();

  // Chrono global de 20 minutes.
  const sections = page.getByRole("navigation", { name: "Sections du QCM" });
  await sections.getByRole("link", { name: "Paramètres" }).click();
  await page.getByLabel("Chrono global", { exact: true }).check();
  await champ(page, "Durée de l’examen (minutes)").fill("20");
  await page.getByRole("button", { name: "Enregistrer les paramètres" }).click();
  await expect(page.getByText("Paramètres enregistrés.")).toBeVisible();

  // « Marquer comme prêt », puis la liste « Mes QCM » montre l'étiquette « Prêt ».
  await sections.getByRole("link", { name: /^Questions/ }).click();
  await page.getByRole("button", { name: "Marquer comme prêt" }).click();
  await expect(page.getByText("Prêt", { exact: true })).toBeVisible();

  await page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name: "QCM", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("QCM");
  await expect(page.getByRole("list", { name: "Mes QCM" }).getByText("Prêt", { exact: true })).toBeVisible();

  // Second QCM laissé en brouillon, pour montrer les deux statuts dans la liste « Mes QCM ».
  await page.getByLabel("Titre du QCM", { exact: true }).fill("Réseaux — Révisions");
  await page.getByRole("button", { name: "Créer le QCM" }).click();
  await expect(page).toHaveURL(/\/enseignant\/qcm\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 2, name: "Question 1" })).toBeVisible();
  await champ(page, "Énoncé").fill("Quel protocole attribue automatiquement une adresse IP à un poste ?");
  await champ(page, "Réponse 1").fill("DHCP");
  await champ(page, "Réponse 2").fill("DNS");
  await champ(page, "Bonne réponse : réponse 1").check();
  await attendreEnregistrement(page);

  await page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name: "QCM", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("QCM");
  const listeMesQcm = page.getByRole("list", { name: "Mes QCM" });
  await expect(listeMesQcm.getByText("Brouillon", { exact: true })).toBeVisible();
  await expect(listeMesQcm.getByText("Prêt", { exact: true })).toBeVisible();

  await capturerHautDePage(page, "mes-qcm");

  // 5. Aperçu étudiant sur téléphone : cookies de la page enseignante dans un second contexte iPhone 15.
  const etatStockage = await page.context().storageState();
  const contextePhone = await browser.newContext({
    ...devices["iPhone 15"],
    baseURL: URL_E2E,
    storageState: etatStockage,
  });
  const pagePhone = await contextePhone.newPage();
  await pagePhone.goto(`/enseignant/qcm/${qcmId}/apercu?question=2`);
  await expect(pagePhone.getByText("Question 2 / 4")).toBeVisible();

  // Réponse B : « 24 », la bonne réponse de la question 2.
  const reponses = pagePhone.getByRole("group", { name: "Réponses" }).getByRole("button");
  await reponses.nth(1).click();
  await expect(reponses.nth(1)).toHaveAttribute("aria-pressed", "true");

  const cadreApercu = pagePhone.locator('[data-capture="apercu"]');
  await cadreApercu.screenshot({ path: capture("apercu-etudiant") });

  await contextePhone.close();

  // 6. Session : six téléphones dans la salle d'attente, un septième qui demande un nom déjà pris.
  await page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name: "Sessions", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sessions");
  await page.getByRole("button", { name: "Créer la session" }).click();
  await expect(page).toHaveURL(/\/enseignant\/sessions\/[0-9a-f-]{36}$/);
  const sessionId = /\/enseignant\/sessions\/([0-9a-f-]{36})$/.exec(page.url())?.[1];
  if (!sessionId) throw new Error(`Identifiant de la session introuvable dans l'URL : ${page.url()}`);

  const telephones: Awaited<ReturnType<typeof nouveauTelephone>>[] = [];
  for (const [nom, prenom] of ETUDIANTS.slice(0, 6)) {
    const telephone = await nouveauTelephone(browser, "iPhone 15");
    await page.bringToFront();
    await rejoindre(telephone.page, await lireCode(page), nom, prenom);
    telephones.push(telephone);
  }
  const doublon = await nouveauTelephone(browser, "iPhone 15");
  await page.bringToFront();
  await scanner(doublon.page, await lireCode(page));
  await choisirNom(doublon.page, "DUPONT", "DUPONT Léa");
  await expect(doublon.page.getByRole("heading", { level: 1 })).toHaveText(
    "Demande envoyée à ton enseignant",
  );
  await expect(page.getByRole("region", { name: "Demandes d’appareil" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dans la salle · 6 / 30" })).toBeVisible();
  await capturerHautDePage(page, "pilotage");

  // Écran projeté, à la taille d'un vidéoprojecteur.
  const projection = await page.context().newPage();
  await projection.setViewportSize({ width: 1440, height: 900 });
  await projection.goto(`/projection/${sessionId}`);
  await expect(projection.getByText("6 / 30", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      projection
        .getByRole("img", { name: "QR code de la session" })
        .evaluate((img) => (img as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await projection.screenshot({ path: capture("projection") });
  await projection.close();

  // Salle d'attente, sur le téléphone de Léa Dupont.
  const [lea] = telephones;
  if (!lea) throw new Error("téléphone de Léa absent");
  await expect(lea.page.getByRole("heading", { level: 1 })).toHaveText("Bonjour Léa");
  await lea.page.screenshot({ path: capture("salle-attente") });

  // 7. Examen : départ commun, puis Léa répond à chaque question. La question avec du code est
  // capturée (l'ordre des questions est mélangé pour chaque étudiant), puis l'écran de fin.
  // Trois réponses justes et une fausse : une fin d'examen réaliste (13,75 / 20 avec le barème à −0,25).
  const REPONSES_LEA: Record<string, string> = {
    "Quelle est la complexité d’une boucle simple sur n éléments ?": "O(n)",
    "Qu’affiche ce programme ?": "24",
    "Quel graphique montre une fonction croissante sur [0 ; 5] ?": "Le graphique B",
    "Une pile suit l’ordre FIFO.": "Faux",
  };
  await page.bringToFront();
  await page.getByRole("button", { name: "Démarrer l’examen" }).click();
  await page.getByRole("button", { name: "Démarrer maintenant" }).click();
  let questionCapturee = false;
  for (let rang = 1; rang <= 4; rang += 1) {
    const question = lea.page.locator(`[data-etat="question"][data-rang="${rang}"]`);
    await expect(question).toBeVisible({ timeout: 20_000 });
    const enonce = (await question.getByRole("heading", { level: 2 }).textContent()) ?? "";
    const texte = REPONSES_LEA[enonce];
    if (!texte) throw new Error(`Énoncé inattendu : ${enonce}`);
    const choisie = question.getByRole("group", { name: "Réponses" }).getByRole("button", { name: texte });
    await choisie.click();
    await expect(choisie).toHaveAttribute("aria-pressed", "true");
    if (!questionCapturee && (await question.getByRole("group", { name: /^Code / }).count()) > 0) {
      await lea.page.evaluate(() => window.scrollTo(0, 0));
      await lea.page.screenshot({ path: capture("examen-question") });
      questionCapturee = true;
    }
    await lea.page.waitForTimeout(2_500);
    await question.getByRole("button", { name: "Valider et continuer" }).click();
  }
  expect(questionCapturee).toBe(true);
  await expect(lea.page.getByRole("heading", { level: 1 })).toHaveText("Examen terminé");
  await expect(lea.page.getByText("13,75 / 20", { exact: true })).toBeVisible();
  await lea.page.screenshot({ path: capture("examen-fin") });

  await Promise.all([...telephones, doublon].map((t) => t.contexte.close()));
});
