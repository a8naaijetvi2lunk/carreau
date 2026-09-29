import { expect, test } from "@playwright/test";
import { ETUDIANTS } from "./outils/listes";
import { alerte } from "./outils/parcours";
import {
  choisirNom,
  CONTACT_DONNEES,
  creerSession,
  effacerParametres,
  entrerEnSalle,
  lireCode,
  nouveauTelephone,
  preparerEnseignante,
  rejoindre,
  scanner,
  type Telephone,
} from "./outils/sessions";

/** Signe moins typographique du barème (U+2212). */
const MOINS = String.fromCharCode(0x2212);

test.describe("sessions", () => {
  // État global remis à zéro : les fichiers rejoués par les projets suivants ne doivent pas en dépendre.
  test.afterAll(async () => {
    await effacerParametres();
  });

  test("trente téléphones rejoignent la salle d’attente et démarrent ensemble", async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "ordinateur", "Parcours long : joué sur ordinateur seulement.");
    test.setTimeout(420_000);
    await preparerEnseignante(page, "salle-entiere@exemple.fr");
    const sessionId = await creerSession(page);

    // Écran projeté, dans un second onglet de l'enseignante.
    const projection = await page.context().newPage();
    await projection.goto(`/projection/${sessionId}`);
    await expect(projection.getByText("Salle d’attente ouverte")).toBeVisible();
    await expect(projection.getByRole("img", { name: "QR code de la session" })).toBeVisible();

    // Trente téléphones, iPhone et Android émulés, par groupes de dix ; le code est relu avant
    // chaque groupe (il change toutes les 30 s, le précédent reste accepté).
    const telephones: (Telephone & { nom: string; prenom: string })[] = [];
    for (const [index, [nom, prenom]] of ETUDIANTS.entries()) {
      telephones.push({
        ...(await nouveauTelephone(browser, index % 2 === 0 ? "iPhone 15" : "Pixel 7")),
        nom,
        prenom,
      });
    }
    for (let debut = 0; debut < telephones.length; debut += 10) {
      // Le suivi du pilotage est suspendu quand son onglet est masqué : l'onglet revient au premier plan.
      await page.bringToFront();
      const code = await lireCode(page);
      await Promise.all(
        telephones.slice(debut, debut + 10).map((t) => rejoindre(t.page, code, t.nom, t.prenom)),
      );
    }
    await expect(page.getByRole("heading", { name: "Dans la salle · 30 / 30" })).toBeVisible();
    await expect(projection.getByText("30 / 30", { exact: true })).toBeVisible();

    // Départ commun : tous les téléphones passent à « L’examen a commencé » au même instant.
    await page.getByRole("button", { name: "Démarrer l’examen" }).click();
    await page.getByRole("button", { name: "Démarrer maintenant" }).click();
    await Promise.all(
      telephones.map((t) =>
        expect(t.page.locator('[data-etat="commence"]')).toBeVisible({ timeout: 20_000 }),
      ),
    );
    const instants = await Promise.all(
      telephones.map(async (t) =>
        Number(await t.page.locator('[data-etat="commence"]').getAttribute("data-commence-a")),
      ),
    );
    expect(instants.every((instant) => Number.isFinite(instant) && instant > 0)).toBe(true);
    const ecart = Math.max(...instants) - Math.min(...instants);
    testInfo.annotations.push({ type: "écart de départ (ms)", description: String(ecart) });
    expect(ecart).toBeLessThan(2_000);
    await expect(projection.getByRole("heading", { name: "L’examen a commencé" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(projection.getByRole("status", { name: "Code de la session" })).toHaveCount(0);

    // Reprise de Léa Dupont sur un autre téléphone : code montré par la page de pilotage, demande autorisée.
    const lea = telephones.find((t) => t.nom === "DUPONT");
    if (!lea) throw new Error("téléphone de Léa absent");
    const nouveau = await nouveauTelephone(browser, "Pixel 7");
    await page.bringToFront();
    await scanner(nouveau.page, await lireCode(page));
    await expect(nouveau.page.getByText("L’examen a déjà commencé", { exact: false })).toBeVisible();
    await choisirNom(nouveau.page, "DUPONT", "DUPONT Léa");
    await expect(nouveau.page.getByRole("heading", { level: 1 })).toHaveText(
      "Demande envoyée à ton enseignant",
    );
    const demandes = page.getByRole("region", { name: "Demandes d’appareil" });
    await expect(demandes).toContainText("Reprise sur un autre téléphone");
    await demandes.getByRole("button", { name: "Autoriser la demande de DUPONT Léa" }).click();
    await expect(nouveau.page.getByRole("heading", { level: 1 })).toHaveText("L’examen a commencé", {
      timeout: 15_000,
    });
    await expect(lea.page.getByRole("heading", { level: 1 })).toHaveText(
      "Ce téléphone n’est plus associé à ton nom",
      {
        timeout: 15_000,
      },
    );

    await Promise.all([...telephones, nouveau].map((t) => t.contexte.close()));
  });

  test("un second téléphone demande le même nom : refus, autorisation, retrait et annulation", async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(240_000);
    const appareil = testInfo.project.name === "iphone" ? "iPhone 15" : "Pixel 7";
    await preparerEnseignante(page, `sessions-${testInfo.project.name}@exemple.fr`);
    await creerSession(page);
    const a = await nouveauTelephone(browser, appareil);
    const b = await nouveauTelephone(browser, appareil);
    const violations: string[] = [];
    for (const t of [a, b]) {
      t.page.on("console", (message) => {
        if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
          violations.push(message.text());
        }
      });
    }

    // Un code faux est refusé.
    await b.page.goto("/rejoindre");
    await expect(b.page.getByRole("heading", { level: 1 })).toHaveText("Rejoindre un examen");
    await b.page.getByLabel("Code de la session", { exact: true }).fill("AAAAAA");
    await b.page.getByRole("button", { name: "Rejoindre", exact: true }).click();
    await expect(alerte(b.page)).toContainText("Code inconnu ou expiré");

    // Léa Dupont rejoint sur le téléphone A : « Dup » donne trois étudiants.
    await scanner(a.page, await lireCode(page));
    await a.page.getByLabel("Ton nom ou ton prénom", { exact: true }).fill("Dup");
    await expect(a.page.getByText("3 étudiants correspondent")).toBeVisible();
    await a.page.getByRole("button", { name: "DUPONT Léa", exact: true }).click();
    await a.page.getByRole("button", { name: "C’est moi, continuer" }).click();
    await expect(
      a.page.getByText("Conservation : événements 30 jours, résultats 365 jours", { exact: false }),
    ).toBeVisible();
    await expect(a.page.getByText(`Contact : ${CONTACT_DONNEES}`, { exact: false })).toBeVisible();
    await entrerEnSalle(a.page, "Léa");
    await expect(a.page.getByText("20 min", { exact: true })).toBeVisible();
    await expect(a.page.getByText(`+1 juste · ${MOINS}0,25 faux`, { exact: true })).toBeVisible();
    const salle = page.getByRole("region", { name: /^Dans la salle/ });
    await expect(salle).toContainText("DUPONT Léa");

    // Téléphone B : même nom ; demande refusée, renouvelée puis autorisée ; A n'est plus associé.
    await scanner(b.page, await lireCode(page));
    await choisirNom(b.page, "Dupont", "DUPONT Léa");
    await expect(b.page.getByRole("heading", { level: 1 })).toHaveText("Demande envoyée à ton enseignant");
    const demandes = page.getByRole("region", { name: "Demandes d’appareil" });
    await expect(demandes).toContainText("Nom déjà utilisé sur un autre appareil");
    await demandes.getByRole("button", { name: "Refuser la demande de DUPONT Léa" }).click();
    await expect(b.page.getByRole("heading", { level: 1 })).toHaveText("Demande refusée");
    await b.page.getByRole("button", { name: "Refaire une demande" }).click();
    await expect(b.page.getByRole("heading", { level: 1 })).toHaveText("Demande envoyée à ton enseignant");
    await demandes.getByRole("button", { name: "Autoriser la demande de DUPONT Léa" }).click();
    await expect(b.page.getByRole("heading", { level: 1 })).toHaveText("Bonjour Léa");
    await expect(a.page.getByRole("heading", { level: 1 })).toHaveText(
      "Ce téléphone n’est plus associé à ton nom",
    );

    // Retrait : B revient au choix du nom (son ticket vaut encore) ; réinscrit, il relit l'information.
    await salle.getByRole("button", { name: "Retirer DUPONT Léa" }).click();
    await expect(b.page.getByRole("heading", { level: 1 })).toHaveText("Qui es-tu ?");
    await choisirNom(b.page, "Dupont", "DUPONT Léa");
    await expect(b.page.getByRole("heading", { level: 1 })).toHaveText("Ce qui est noté pendant l’examen");

    // Annulation : le téléphone B, sur l'écran d'information, voit la session annulée.
    await page.getByRole("button", { name: "Annuler la session" }).click();
    await page.getByRole("button", { name: "Oui, annuler la session" }).click();
    await expect(b.page.getByRole("heading", { level: 1 })).toHaveText("Session annulée", {
      timeout: 15_000,
    });

    expect(violations).toEqual([]);
    expect(await b.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await Promise.all([a.contexte.close(), b.contexte.close()]);
  });
});
