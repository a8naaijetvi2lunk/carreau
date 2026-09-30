import { expect, test } from "@playwright/test";

test.describe("pwa", () => {
  test("le manifeste est servi avec son type et décrit l'application installable", async ({ request }) => {
    const reponse = await request.get("/manifest.webmanifest");
    expect(reponse.status()).toBe(200);
    expect(reponse.headers()["content-type"]).toContain("application/manifest+json");
    const manifeste = (await reponse.json()) as { icons: { src: string }[] };
    expect(manifeste).toMatchObject({
      id: "/",
      name: "Carreau",
      short_name: "Carreau",
      start_url: "/rejoindre",
      scope: "/",
      display: "standalone",
      lang: "fr",
      background_color: "#f4f1ea",
      theme_color: "#f4f1ea",
    });
    expect(manifeste.icons.map((icone) => icone.src)).toEqual([
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/icon-maskable-512.png",
    ]);
    for (const icone of manifeste.icons) {
      const image = await request.get(icone.src);
      expect(image.status(), icone.src).toBe(200);
      expect(image.headers()["content-type"], icone.src).toBe("image/png");
    }
  });

  test("la page annonce le manifeste, l'icône d'écran d'accueil, le favicon et la couleur de thème", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#f4f1ea");
    await expect(
      page.locator('meta[name="mobile-web-app-capable"], meta[name="apple-mobile-web-app-capable"]'),
    ).not.toHaveCount(0);
    const favicon = await request.get("/favicon.ico");
    expect(favicon.status()).toBe(200);
    expect([...(await favicon.body()).subarray(0, 4)]).toEqual([0, 0, 1, 0]);
  });

  test("le service worker est servi sans cache, avec sa propre CSP", async ({ request }) => {
    const reponse = await request.get("/sw.js");
    expect(reponse.status()).toBe(200);
    const entetes = reponse.headers();
    expect(entetes["content-type"]).toContain("javascript");
    expect(entetes["cache-control"]).toBe("no-cache, no-store, must-revalidate");
    expect(entetes["content-security-policy"]).toBe("default-src 'self'; script-src 'self'");
  });

  test.describe("service worker (Chromium)", () => {
    test.skip(({ browserName }) => browserName !== "chromium", "Service workers : Chromium seulement.");

    test("le service worker prend la main sur les pages", async ({ page }) => {
      await page.goto("/");
      const script = await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.scriptURL);
      expect(script).toMatch(/\/sw\.js$/);
    });

    test("hors ligne, une navigation affiche la page de repli, sans rien garder en cache", async ({
      page,
      context,
    }) => {
      await page.goto("/");
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await context.setOffline(true);
      const reponse = await page.goto("/rejoindre");
      expect(reponse?.status()).toBe(503);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pas de connexion");
      expect(await page.evaluate(() => caches.keys())).toEqual([]);
      await context.setOffline(false);
      await page.getByRole("link", { name: "Réessayer" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rejoindre un examen");
    });
  });
});
