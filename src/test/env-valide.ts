import { reinitialiserEnvPourLesTests } from "@/lib/env";

/** Environnement valide pour les tests unitaires. Aucune valeur réelle : clé de test = octets 0 à 31. */
export const ENV_VALIDE = {
  DATABASE_URL: "postgres://carreau:carreau@localhost:50171/carreau_test",
  NODE_ENV: "test",
  APP_URL: "http://localhost:50173",
  IMAGES_DIR: "./.donnees/images-test",
  CHIFFREMENT_CLE: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
} as const;

/** Pose `ENV_VALIDE` (et les surcharges ; `undefined` retire la variable) puis vide le cache de `env()`. */
export function appliquerEnvValide(surcharges: Record<string, string | undefined> = {}): void {
  for (const [cle, valeur] of Object.entries({ ...ENV_VALIDE, ...surcharges })) {
    if (valeur === undefined) delete process.env[cle];
    else process.env[cle] = valeur;
  }
  reinitialiserEnvPourLesTests();
}
