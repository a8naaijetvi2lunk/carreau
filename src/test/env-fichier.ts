/**
 * Variables du seul fichier `.env` pour les tests d'intégration. Jamais `.env.local` : le spec
 * l'interdit (§13) et Next ne le charge pas en test. Les variables déjà posées (terminal, CI)
 * gardent la priorité.
 */
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export function appliquerFichierEnv(chemin = ".env"): void {
  if (!existsSync(chemin)) return;
  const valeurs = parseEnv(readFileSync(chemin, "utf8")) as Record<string, string>;
  for (const [cle, valeur] of Object.entries(valeurs)) {
    process.env[cle] ??= valeur;
  }
}
