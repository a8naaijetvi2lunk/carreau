import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import boundaries from "eslint-plugin-boundaries";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Frontières d'architecture (spec §3.2). Motifs en dossiers : un motif
    // `src/x/**/*` ne classerait pas `src/x/index.ts` et rendrait les règles inertes.
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "import/resolver": { typescript: { alwaysTryTypes: true, project: "./tsconfig.json" } },
      "boundaries/elements": [
        { type: "app", pattern: "src/app" },
        { type: "module", pattern: "src/modules/*", capture: ["nom"] },
        { type: "moteur", pattern: "src/moteur" },
        { type: "lib", pattern: "src/lib" },
        { type: "db", pattern: "src/db" },
        { type: "composants", pattern: "src/components" },
        { type: "test", pattern: "src/test" },
      ],
      "boundaries/files": [{ pattern: "**/*.test.{ts,tsx}", category: "test" }],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            {
              from: { element: { type: "app" } },
              allow: [
                { to: { element: { types: ["lib", "composants"] } } },
                { to: { element: { type: "module", fileInternalPath: "index.ts" } } },
              ],
            },
            {
              from: { element: { type: "module" } },
              allow: [
                { to: { element: { types: ["lib", "moteur", "db", "composants"] } } },
                { to: { element: { type: "module", fileInternalPath: "index.ts" } } },
              ],
            },
            { from: { element: { type: "moteur" } }, allow: { to: { element: { type: "lib" } } } },
            { from: { element: { type: "composants" } }, allow: { to: { element: { type: "lib" } } } },
            { from: { element: { type: "db" } }, allow: { to: { element: { type: "lib" } } } },
            {
              from: { element: { type: "test" } },
              allow: { to: { element: { types: ["lib", "db", "module", "moteur"] } } },
            },
            {
              from: { file: { categories: "test" } },
              allow: {
                to: { element: { types: ["lib", "db", "module", "moteur", "test", "composants", "app"] } },
              },
            },
          ],
        },
      ],
    },
  },
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "drizzle/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
