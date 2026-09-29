/**
 * Étapes communes des parcours de session (lot 4) : enseignante prête (conservation renseignée,
 * classe TD2 importée, QCM prêt), session créée, code lu sur la page de pilotage, téléphone qui
 * rejoint la salle d'attente.
 */
import { devices, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { creerLienSuperAdmin } from "./comptes";
import { URL_E2E, urlBaseE2e } from "./env";
import { listeTd2Csv } from "./listes";
import { activerEtEnroler } from "./parcours";

export const CONTACT_DONNEES = "Direction des études (exemple)";

function champ(page: Page, libelle: string) {
  return page.getByLabel(libelle, { exact: true });
}

/** Lien de la navigation principale ; la page ouverte porte le même titre. */
async function naviguer(page: Page, libelle: string): Promise<void> {
  await page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name: libelle, exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(libelle);
}

/** Attend que l'enregistrement automatique de l'éditeur ait suivi la dernière saisie. */
async function attendreEnregistrement(page: Page): Promise<void> {
  await expect(page.getByRole("status").filter({ hasText: /^Enregistré à \d{2}:\d{2}$/ })).toBeVisible();
}

/**
 * Super-admin fictive « Claire Arnaud » (tous les rôles ont leurs classes et leurs QCM) : conservation
 * des données renseignée, classe TD2 de 30 étudiants importée, QCM « Algorithmique — Contrôle 2 » de
 * deux questions (chrono global de 20 min, −0,25 par erreur) marqué prêt.
 */
export async function preparerEnseignante(page: Page, email: string): Promise<void> {
  await page.goto(creerLienSuperAdmin(email));
  await activerEtEnroler(page, { prenom: "Claire", nom: "Arnaud" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bonjour Claire");

  await naviguer(page, "Paramètres");
  const conservation = page.getByRole("region", { name: "Conservation des données" });
  await conservation.getByLabel("Événements enregistrés (jours)", { exact: true }).fill("30");
  await conservation.getByLabel("Résultats et notes (jours)", { exact: true }).fill("365");
  await conservation.getByLabel("Contact affiché aux étudiants", { exact: true }).fill(CONTACT_DONNEES);
  await conservation.getByRole("button", { name: "Enregistrer" }).click();
  await expect(conservation.getByText("Conservation des données enregistrée.")).toBeVisible();

  await naviguer(page, "Classes");
  await champ(page, "Nom de la classe").fill("TD2");
  await page.getByRole("button", { name: "Créer la classe" }).click();
  await expect(page).toHaveURL(/\/enseignant\/classes\/[0-9a-f-]{36}$/);
  await page
    .getByLabel("Fichier de la liste")
    .setInputFiles({ name: "td2.csv", mimeType: "text/csv", buffer: listeTd2Csv() });
  await page.getByRole("button", { name: "Voir l’aperçu" }).click();
  await expect(page.getByText("30 étudiants à ajouter · 2 lignes rejetées")).toBeVisible();
  await page.getByRole("button", { name: "Importer 30 étudiants" }).click();
  await expect(page.getByText("Import enregistré : 30 étudiants ajoutés.")).toBeVisible();

  await naviguer(page, "QCM");
  await champ(page, "Titre du QCM").fill("Algorithmique — Contrôle 2");
  await page.getByRole("button", { name: "Créer le QCM" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Question 1" })).toBeVisible();
  await champ(page, "Énoncé").fill("Quelle est la complexité d’une boucle simple sur n éléments ?");
  await champ(page, "Réponse 1").fill("O(1)");
  await champ(page, "Réponse 2").fill("O(n)");
  await champ(page, "Bonne réponse : réponse 2").check();
  await page
    .getByRole("group", { name: "Barème" })
    .getByLabel("Mauvaise réponse", { exact: true })
    .fill("-0,25");
  await attendreEnregistrement(page);
  // Nouvelle question : même type et même barème que la précédente (décision D9 du lot 3).
  await page.getByRole("button", { name: "+ Ajouter une question" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Question 2" })).toBeVisible();
  await champ(page, "Énoncé").fill("Une pile suit l’ordre FIFO.");
  await champ(page, "Réponse 1").fill("Vrai");
  await champ(page, "Réponse 2").fill("Faux");
  await champ(page, "Bonne réponse : réponse 2").check();
  await attendreEnregistrement(page);
  await page
    .getByRole("navigation", { name: "Sections du QCM" })
    .getByRole("link", { name: "Paramètres" })
    .click();
  await page.getByLabel("Chrono global", { exact: true }).check();
  await champ(page, "Durée de l’examen (minutes)").fill("20");
  await page.getByRole("button", { name: "Enregistrer les paramètres" }).click();
  await expect(page.getByText("Paramètres enregistrés.")).toBeVisible();
  await page.getByRole("button", { name: "Marquer comme prêt" }).click();
  await expect(page.getByText("Prêt", { exact: true })).toBeVisible();
}

/** Crée une session sur le QCM et la classe préparés ; renvoie son identifiant (page de pilotage ouverte). */
export async function creerSession(page: Page): Promise<string> {
  await naviguer(page, "Sessions");
  await page.getByRole("button", { name: "Créer la session" }).click();
  await expect(page).toHaveURL(/\/enseignant\/sessions\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Algorithmique — Contrôle 2 · TD2");
  const sessionId = /\/enseignant\/sessions\/([0-9a-f-]{36})$/.exec(page.url())?.[1];
  if (!sessionId) throw new Error(`Identifiant de session absent de l'URL : ${page.url()}`);
  return sessionId;
}

/** Code affiché par la page de pilotage ou l'écran projeté (« K7M 4QP »), sans l'espace. */
export async function lireCode(page: Page): Promise<string> {
  const texte = await page.getByRole("status", { name: "Code de la session" }).textContent();
  const code = (texte ?? "").replace(/\s/g, "");
  expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
  return code;
}

export type Telephone = { contexte: BrowserContext; page: Page };

/** Nouveau téléphone émulé, dans son propre contexte (ses propres cookies). */
export async function nouveauTelephone(
  browser: Browser,
  appareil: "iPhone 15" | "Pixel 7" = "Pixel 7",
): Promise<Telephone> {
  const contexte = await browser.newContext({
    ...devices[appareil],
    baseURL: URL_E2E,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  });
  return { contexte, page: await contexte.newPage() };
}

/**
 * Ouvre le lien du QR code : le choix du nom s'affiche. Un aller par `about:blank` force une vraie
 * navigation (comme un téléphone qui ouvre le lien pour la première fois) : `page.goto` vers la même
 * URL avec un simple fragment différent ne recharge pas le document (fragment purement local), ce
 * qui laisserait passer un code jamais lu par une page déjà ouverte sur `/rejoindre`.
 */
export async function scanner(telephone: Page, code: string): Promise<void> {
  await telephone.goto("about:blank");
  await telephone.goto(`/rejoindre#${code}`);
  await expect(telephone.getByRole("heading", { level: 1 })).toHaveText("Qui es-tu ?");
}

/** Cherche un nom, choisit « NOM Prénom », puis « C’est moi, continuer ». */
export async function choisirNom(telephone: Page, recherche: string, nomAffiche: string): Promise<void> {
  await telephone.getByLabel("Ton nom ou ton prénom", { exact: true }).fill(recherche);
  await telephone.getByRole("button", { name: nomAffiche, exact: true }).click();
  await telephone.getByRole("button", { name: "C’est moi, continuer" }).click();
}

/** Lit l'information et entre en salle d'attente. */
export async function entrerEnSalle(telephone: Page, prenom: string): Promise<void> {
  await expect(telephone.getByRole("heading", { level: 1 })).toHaveText("Ce qui est noté pendant l’examen");
  await telephone.getByLabel("J’ai lu et compris ces informations").check();
  await telephone.getByRole("button", { name: "Rejoindre la salle d’attente" }).click();
  await expect(telephone.getByRole("heading", { level: 1 })).toHaveText(`Bonjour ${prenom}`);
}

/** Parcours complet d'un téléphone jusqu'à la salle d'attente ; `nom` en majuscules, comme la liste. */
export async function rejoindre(telephone: Page, code: string, nom: string, prenom: string): Promise<void> {
  await scanner(telephone, code);
  await choisirNom(telephone, nom, `${nom} ${prenom}`);
  await entrerEnSalle(telephone, prenom);
}

/**
 * Efface les paramètres de l'installation (ligne unique `parametres`) : `preparerEnseignante` renseigne
 * la conservation des données pour toute la base, et `comptes.spec.ts`, rejoué par les projets suivants,
 * attend un super-admin fraîchement activé sans conservation renseignée.
 */
export async function effacerParametres(): Promise<void> {
  const client = new pg.Client({ connectionString: urlBaseE2e() });
  await client.connect();
  try {
    await client.query("DELETE FROM parametres");
  } finally {
    await client.end();
  }
}
