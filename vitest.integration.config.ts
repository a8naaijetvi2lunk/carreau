import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
    // Base modèle migrée une fois (src/test/global-setup.ts), puis une base isolée par
    // fichier (src/test/base-isolee.ts) : les fichiers tournent en parallèle.
    globalSetup: ["src/test/global-setup.ts"],
    setupFiles: ["src/test/setup-integration.ts"],
    fileParallelism: true,
    hookTimeout: 60_000,
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/modules/**/*.ts"],
      exclude: ["**/*.test.ts", "**/index.ts"],
      reporter: ["text-summary", "html"],
      reportsDirectory: "coverage/integration",
      thresholds: { lines: 85, functions: 85, branches: 85, statements: 85 },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/module-vide.ts"),
    },
  },
});
