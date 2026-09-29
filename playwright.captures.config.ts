/**
 * Configuration Playwright dédiée aux captures du README (tâche 17, demande d'Yves pendant le
 * lot 3) : `npm run captures`, jamais `npm run test:e2e` (testDir et testMatch dédiés). Comme
 * playwright.config.ts, le serveur testé est le build autonome (`npm run build` d'abord).
 */
import { defineConfig, devices } from "@playwright/test";
import { envServeur, URL_E2E } from "./e2e/outils/env";

export default defineConfig({
  testDir: "e2e/captures",
  testMatch: "*.captures.ts",
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 180_000,
  reporter: "list",
  use: {
    baseURL: URL_E2E,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  },
  projects: [
    {
      name: "captures",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: "node e2e/serveur.mjs",
    url: `${URL_E2E}/api/sante`,
    env: envServeur(),
    // Jamais un serveur déjà lancé : la base doit être recréée à chaque fois.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
  },
});
