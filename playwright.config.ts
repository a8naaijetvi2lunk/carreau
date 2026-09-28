/**
 * Tests de bout en bout (spec §13) : `npm run build` puis `npm run test:e2e`. Le serveur testé
 * est le build autonome, celui de l'image Docker, sur une base recréée à chaque lancement.
 */
import { defineConfig, devices } from "@playwright/test";
import { envServeur, URL_E2E } from "./e2e/outils/env";

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: URL_E2E,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "ordinateur", use: { ...devices["Desktop Chrome"] } },
    { name: "iphone", use: { ...devices["iPhone 15"] } },
    { name: "android", use: { ...devices["Pixel 7"] } },
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
