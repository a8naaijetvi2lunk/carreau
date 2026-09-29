import { expect, test, type Page } from "@playwright/test";
import { creerLienSuperAdmin } from "./outils/comptes";
import { classeurXlsx, listeTd2Csv } from "./outils/listes";
import { activerEtEnroler } from "./outils/parcours";

const FICHIER_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Nouveau compte (super-admin créé par script : tous les rôles ont leurs classes), connecté. */
async function nouveauCompte(page: Page, email: string, identite: { prenom: string; nom: string }) {
  await page.goto(creerLienSuperAdmin(email));
  await activerEtEnroler(page, identite);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Bonjour ${identite.prenom}`);
}

async function creerClasse(page: Page, nom: string) {
  await page.getByRole("link", { name: "Classes", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Classes");
  await page.getByLabel("Nom de la classe", { exact: true }).fill(nom);
  await page.getByRole("button", { name: "Créer la classe" }).click();
  await expect(page).toHaveURL(/\/enseignant\/classes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 2, name: nom })).toBeVisible();
}

function etudiants(page: Page) {
  return page.getByRole("list", { name: "Étudiants de la classe" }).getByRole("listitem");
}

/** Panneau de la classe choisie (section nommée par son titre), hors de la liste des classes. */
function panneau(page: Page, nom: string) {
  return page.getByRole("region", { name: nom });
}

test.describe("classes", () => {
  test("un enseignant importe une liste de 30 étudiants, avec les rejets expliqués", async ({
    page,
  }, testInfo) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
        violations.push(message.text());
      }
    });
    await nouveauCompte(page, `classes-${testInfo.project.name}@exemple.fr`, {
      prenom: "Claire",
      nom: "Arnaud",
    });
    await creerClasse(page, "TD2");
    await expect(panneau(page, "TD2").getByText("0 étudiant", { exact: true })).toBeVisible();

    // 1. Aperçu : 30 étudiants à ajouter, deux lignes rejetées et expliquées ; rien n'est encore enregistré.
    await page
      .getByLabel("Fichier de la liste")
      .setInputFiles({ name: "td2.csv", mimeType: "text/csv", buffer: listeTd2Csv() });
    await page.getByRole("button", { name: "Voir l’aperçu" }).click();
    await expect(page.getByText("30 étudiants à ajouter · 2 lignes rejetées")).toBeVisible();
    const rejets = page.getByRole("list", { name: "Lignes rejetées" }).getByRole("listitem");
    await expect(rejets).toHaveText([
      "Ligne 13 : Le prénom est obligatoire.",
      "Ligne 33 : Même nom et même prénom qu'à la ligne 6.",
    ]);
    await expect(panneau(page, "TD2").getByText("0 étudiant", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // 2. Import confirmé.
    await page.getByRole("button", { name: "Importer 30 étudiants" }).click();
    await expect(page.getByText("Import enregistré : 30 étudiants ajoutés.")).toBeVisible();
    await expect(page.getByText("30 étudiants · dont 2 avec tiers-temps")).toBeVisible();
    await expect(etudiants(page)).toHaveCount(30);
    await expect(page.getByRole("link", { name: /^TD2 30 étudiants$/ })).toBeVisible();

    // 3. Recherche sans accents ni casse, sur le début du nom ou du prénom.
    const recherche = page.getByLabel("Rechercher un étudiant");
    await recherche.fill("dup");
    await expect(etudiants(page)).toHaveCount(3);
    await recherche.fill("RAPHAEL");
    await expect(etudiants(page)).toHaveText([/CLÉMENT/]);
    await recherche.fill("");

    // 4. Tiers-temps, retrait, homonyme refusé.
    const interrupteur = page.getByRole("button", { name: "Tiers-temps pour Léa DUPONT" });
    await expect(interrupteur).toHaveAttribute("aria-pressed", "false");
    await interrupteur.click();
    await expect(interrupteur).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("30 étudiants · dont 3 avec tiers-temps")).toBeVisible();
    await page.getByRole("button", { name: "Retirer Paul ROUSSEL" }).click();
    await expect(etudiants(page)).toHaveCount(29);
    await expect(page.getByText("29 étudiants · dont 3 avec tiers-temps")).toBeVisible();
    await page.getByLabel("Nom", { exact: true }).fill("dupont");
    await page.getByLabel("Prénom", { exact: true }).fill("LEA");
    await page.getByRole("button", { name: "Ajouter l’étudiant" }).click();
    await expect(
      page.getByText(
        "LEA dupont est déjà dans la classe : distingue-les par une initiale ou un second prénom.",
      ),
    ).toBeVisible();
    await expect(etudiants(page)).toHaveCount(29);

    expect(violations).toEqual([]);
  });

  test("collage, classeur Excel, fichier refusé, archivage, et la classe d'un autre compte reste introuvable", async ({
    page,
  }, testInfo) => {
    const suffixe = testInfo.project.name;
    await nouveauCompte(page, `classes-a-${suffixe}@exemple.fr`, { prenom: "Claire", nom: "Arnaud" });
    await creerClasse(page, "Groupe A");
    const adresseClasse = page.url();

    // 1. Liste collée depuis un tableur (tabulations).
    await page.getByRole("button", { name: "Coller depuis un tableur" }).click();
    await page
      .getByLabel("Liste collée depuis ton tableur")
      .fill("Nom\tPrénom\tTiers-temps\nDUPONT\tLéa\toui\nMARTIN\tInès\tnon");
    await page.getByRole("button", { name: "Voir l’aperçu" }).click();
    await expect(page.getByText("2 étudiants à ajouter", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Importer 2 étudiants" }).click();
    await expect(page.getByText("Import enregistré : 2 étudiants ajoutés.")).toBeVisible();

    // 2. Classeur Excel : un nouvel étudiant, un tiers-temps retiré (lu par read-excel-file sur le build autonome).
    await page.getByRole("button", { name: "Fichier CSV ou Excel" }).click();
    await page.getByLabel("Fichier de la liste").setInputFiles({
      name: "groupe-a.xlsx",
      mimeType: FICHIER_XLSX,
      buffer: await classeurXlsx([
        ["Nom", "Prénom", "Tiers-temps"],
        ["Dupont", "Léa", false],
        ["GIRARD", "Enzo", true],
      ]),
    });
    await page.getByRole("button", { name: "Voir l’aperçu" }).click();
    await expect(page.getByText("1 étudiant à ajouter · 1 tiers-temps à mettre à jour")).toBeVisible();
    await page.getByRole("button", { name: "Enregistrer l’import" }).click();
    await expect(
      page.getByText("Import enregistré : 1 étudiant ajouté, 1 tiers-temps mis à jour."),
    ).toBeVisible();
    await expect(page.getByText("3 étudiants · dont 1 avec tiers-temps")).toBeVisible();

    // 3. Un ancien classeur .xls est refusé avec un message clair.
    await page.getByLabel("Fichier de la liste").setInputFiles({
      name: "ancien.xls",
      mimeType: "application/vnd.ms-excel",
      buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]),
    });
    await page.getByRole("button", { name: "Voir l’aperçu" }).click();
    await expect(
      page.getByText(
        "Les fichiers .xls (Excel 97-2003) ne sont pas pris en charge : enregistre-le au format .xlsx ou .csv.",
      ),
    ).toBeVisible();

    // 4. Archivage puis restauration.
    await page.getByRole("button", { name: "Archiver" }).click();
    await expect(page.getByText("Archivée", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Classes en cours" })).toBeVisible();
    await page.getByRole("button", { name: "Restaurer" }).click();
    await expect(page.getByText("Archivée", { exact: true })).toHaveCount(0);

    // 5. Un autre compte ne voit pas cette classe : page 404.
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page).toHaveURL(/\/connexion$/);
    await nouveauCompte(page, `classes-b-${suffixe}@exemple.fr`, { prenom: "Marc", nom: "Petit" });
    const reponse = await page.goto(adresseClasse);
    expect(reponse?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page introuvable");
  });
});
