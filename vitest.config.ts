import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Intégration (base PostgreSQL) : vitest.integration.config.ts. Bout en bout : Playwright.
    exclude: ["**/node_modules/**", "**/.next/**", "e2e/**", "**/*.integration.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/moteur/**/*.ts"],
      exclude: ["**/*.test.ts", "**/index.ts"],
      reporter: ["text-summary", "html"],
      thresholds: {
        "src/lib/**": {
          lines: 90,
          functions: 90,
          branches: 85,
          statements: 90,
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` n'est résolu que par le bundler de Next.
      "server-only": path.resolve(__dirname, "./src/test/module-vide.ts"),
    },
  },
});
