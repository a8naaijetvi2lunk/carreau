import { expect, test, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";
import { creerLienSuperAdmin } from "./outils/comptes";
import { URL_E2E } from "./outils/env";
import { activerEtEnroler } from "./outils/parcours";

const TITRE = "Tris — Contrôle MCP";

/** Nouveau compte (super-admin créé par script : tous les rôles ont leurs QCM), connecté. */
async function nouveauCompte(page: Page, email: string) {
  await page.goto(creerLienSuperAdmin(email));
  await activerEtEnroler(page, { prenom: "Claire", nom: "Arnaud" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bonjour Claire");
}

function navigation(page: Page) {
  return page.getByRole("navigation", { name: "Navigation principale" });
}

/** Requête JSON-RPC envoyée au serveur MCP, comme le ferait un assistant (aucun cookie). */
async function appelMcp(request: APIRequestContext, jeton: string, corps: unknown): Promise<APIResponse> {
  return request.post("/api/mcp", {
    headers: {
      authorization: `Bearer ${jeton}`,
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    },
    data: corps,
  });
}

/** Message JSON-RPC d'une réponse 200, en flux SSE ou en JSON. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- message JSON-RPC lu librement
async function message(reponse: APIResponse): Promise<any> {
  expect(reponse.status()).toBe(200);
  expect(reponse.headers()["cache-control"]).toBe("no-store, no-transform");
  const texte = await reponse.text();
  const ligne = texte.split("\n").find((l) => l.startsWith("data:"));
  return JSON.parse(ligne ? ligne.slice(5) : texte);
}

/** Appel d'un outil : son résultat (JSON du premier bloc de texte), qui ne doit pas être une erreur. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- résultat d'outil lu librement
async function outil(request: APIRequestContext, jeton: string, nom: string, args: unknown): Promise<any> {
  const reponse = await message(
    await appelMcp(request, jeton, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: nom, arguments: args },
    }),
  );
  expect(reponse.result.isError ?? false, reponse.result.content[0].text).toBe(false);
  return JSON.parse(reponse.result.content[0].text);
}

test.describe("mcp", () => {
  test("un assistant crée un brouillon de QCM par MCP avec le jeton de l'enseignant (livrable du lot 8)", async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(120_000);
    await nouveauCompte(page, `mcp-${testInfo.project.name}@exemple.fr`);

    // 1. Page « Connexion MCP » : adresse du serveur, jeton créé et montré une seule fois.
    await navigation(page).getByRole("link", { name: "Connexion MCP", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Connexion MCP");
    await expect(page.getByRole("textbox", { name: "Adresse du serveur", exact: true })).toHaveValue(
      `${URL_E2E}/api/mcp`,
    );
    await expect(page.getByText("Aucun jeton actif : génère le premier ci-dessous.")).toBeVisible();
    await page.getByLabel("Nom du nouveau jeton", { exact: true }).fill("Portable perso");
    await expect(page.getByRole("radio", { name: /^Lecture et écriture/ })).toBeChecked();
    await page.getByRole("button", { name: "Générer un jeton" }).click();
    await expect(
      page.getByText("Jeton « Portable perso » créé. Copie-le maintenant : il ne sera plus jamais affiché."),
    ).toBeVisible();
    const jeton = await page.getByLabel("Nouveau jeton", { exact: true }).inputValue();
    expect(jeton).toMatch(/^carreau_[A-Za-z0-9_-]{43}$/);
    const ligneJeton = page.locator('[data-jeton="Portable perso"]');
    await expect(ligneJeton).toContainText("Lecture et écriture");
    await expect(ligneJeton).toContainText(`${jeton.slice(0, 12)}…`);
    await expect(ligneJeton).toContainText("jamais utilisé");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // Rechargée, la page ne montre plus le jeton.
    await page.reload();
    await expect(page.getByLabel("Nouveau jeton", { exact: true })).toHaveCount(0);
    await expect(page.locator('[data-jeton="Portable perso"]')).toBeVisible();

    // 2. L'assistant se connecte et écrit un brouillon de deux questions liées.
    const init = await message(
      await appelMcp(request, jeton, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "essai", version: "0" },
        },
      }),
    );
    expect(init.result.serverInfo.name).toBe("carreau");
    const cree = await outil(request, jeton, "qcm_creer", { titre: TITRE });
    expect(cree.statut).toBe("brouillon");
    await outil(request, jeton, "question_modifier", {
      questionId: cree.questionId,
      contenu: {
        type: "unique",
        enonce: "Quel tri est stable ?",
        propositions: [
          { texte: "Tri fusion", correcte: true },
          { texte: "Tri rapide", correcte: false },
        ],
      },
    });
    const ajoutee = await outil(request, jeton, "question_ajouter", {
      qcmId: cree.qcmId,
      contenu: {
        type: "unique",
        enonce: "Que renvoie ce code ?",
        code: { langage: "python", source: "print(sorted([3, 1, 2]))" },
        propositions: [
          { texte: "[1, 2, 3]", correcte: true },
          { texte: "[3, 2, 1]", correcte: false },
        ],
      },
    });
    expect(ajoutee.problemes).toEqual([]);
    expect(await outil(request, jeton, "questions_lier", { questionId: cree.questionId })).toMatchObject({
      lieeASuivante: true,
    });

    // 3. L'enseignant retrouve le brouillon, signalé « Créé via MCP · à relire », et l'ouvre dans l'éditeur.
    await navigation(page).getByRole("link", { name: "QCM", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("QCM");
    const ligneQcm = page.getByRole("listitem").filter({ hasText: TITRE });
    await expect(ligneQcm).toContainText("Créé via MCP · à relire");
    await expect(ligneQcm).toContainText("2 questions");
    await expect(ligneQcm).toContainText("Brouillon");
    await ligneQcm.getByRole("link").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(TITRE);
    await expect(page.getByLabel("Énoncé", { exact: true })).toHaveValue("Quel tri est stable ?");

    // 4. Le jeton a servi : dernier usage affiché. Révoqué en deux temps, il ne vaut plus rien.
    await navigation(page).getByRole("link", { name: "Connexion MCP", exact: true }).click();
    await expect(page.locator('[data-jeton="Portable perso"]')).toContainText("dernier usage le");
    await page.getByRole("button", { name: "Révoquer le jeton « Portable perso »", exact: true }).click();
    await page
      .getByRole("button", { name: "Oui, révoquer le jeton « Portable perso »", exact: true })
      .click();
    await expect(page.getByText("Aucun jeton actif : génère le premier ci-dessous.")).toBeVisible();
    const refus = await appelMcp(request, jeton, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(refus.status()).toBe(401);
  });
});
