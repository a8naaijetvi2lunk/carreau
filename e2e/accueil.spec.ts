import { expect, test } from "@playwright/test";

test.describe("socle", () => {
  test("la page d'accueil s'affiche sans violation de CSP", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
        violations.push(message.text());
      }
    });

    const reponse = await page.goto("/");
    expect(reponse?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Des QCM sur téléphone, en classe, pour des examens équitables.",
    );
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");

    const entetes = reponse?.headers() ?? {};
    expect(entetes["content-security-policy"]).toMatch(
      /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/,
    );
    expect(entetes["content-security-policy"]).not.toContain("'unsafe-eval'");
    expect(entetes["x-frame-options"]).toBe("DENY");
    expect(entetes["x-content-type-options"]).toBe("nosniff");

    await page.waitForLoadState("networkidle");
    expect(violations).toEqual([]);
  });

  test("le point de santé répond sans cache", async ({ request }) => {
    const reponse = await request.get("/api/sante");
    expect(reponse.status()).toBe(200);
    expect(await reponse.json()).toEqual({ ok: true });
    expect(reponse.headers()["cache-control"]).toBe("no-store");
  });

  test("une page inconnue renvoie une 404 lisible", async ({ page }) => {
    const reponse = await page.goto("/cette-page-n-existe-pas");
    expect(reponse?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page introuvable");
  });
});
