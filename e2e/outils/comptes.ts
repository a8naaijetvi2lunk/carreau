/** Premier compte des tests de bout en bout : le script admin:creer, lancé sur la base carreau_e2e. */
import { execFileSync } from "node:child_process";
import { URL_E2E, urlBaseE2e } from "./env";

export function creerLienSuperAdmin(email: string): string {
  const sortie = execFileSync(process.execPath, ["scripts/admin-creer.mjs", email], {
    env: { ...process.env, DATABASE_URL: urlBaseE2e(), APP_URL: URL_E2E },
    encoding: "utf8",
  });
  const lien = /https?:\/\/\S+\/activation\/[A-Za-z0-9_-]{43}/.exec(sortie)?.[0];
  if (!lien) throw new Error(`Lien d'activation absent de la sortie du script :\n${sortie}`);
  return lien;
}
