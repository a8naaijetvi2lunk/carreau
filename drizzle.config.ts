import { defineConfig } from "drizzle-kit";

// `generate` compare le schéma TypeScript aux migrations existantes, sans connexion :
// `dbCredentials` n'est ajouté que si DATABASE_URL est présente (jamais de valeur par défaut).
export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema/index.ts",
  dialect: "postgresql",
  casing: "snake_case",
  ...(process.env.DATABASE_URL ? { dbCredentials: { url: process.env.DATABASE_URL } } : {}),
});
