// Crée l'invitation du super-admin et affiche UNE fois son lien d'activation (spec §5) :
//
//   npm run admin:creer -- prenom.nom@exemple.fr
//
// Le lien mène à l'activation : nom, prénom, mot de passe, puis double authentification.
// Variables : DATABASE_URL et APP_URL (lues dans .env en local, dans l'environnement du conteneur).
import { pathToFileURL } from "node:url";
import pg from "pg";
import {
  ErreurScript,
  genererJeton,
  normaliserEmail,
  sha256Hex,
  VALIDITE_INVITATION_JOURS,
} from "./admin-commun.mjs";

/**
 * Crée l'invitation (rôle super_admin) dans une transaction : refuse une adresse qui a déjà un
 * compte, annule l'invitation en attente de la même adresse, journalise.
 * @param {pg.Pool} pool
 * @param {{ email: string; appUrl: string; maintenant?: Date }} options
 * @returns {Promise<{ lien: string; expireLe: Date; invitationId: string }>}
 */
export async function creerInvitationSuperAdmin(pool, { email, appUrl, maintenant = new Date() }) {
  const adresse = normaliserEmail(email);
  const base = new URL(appUrl);
  const jeton = genererJeton();
  const expireLe = new Date(maintenant.getTime() + VALIDITE_INVITATION_JOURS * 24 * 60 * 60 * 1000);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existant = await client.query("SELECT 1 FROM utilisateur WHERE email = $1", [adresse]);
    if (existant.rows.length > 0) {
      throw new ErreurScript(
        "Un compte existe déjà pour cette adresse. Double authentification perdue : npm run admin:reinitialiser-totp -- <email>.",
      );
    }
    await client.query(
      "UPDATE invitation SET annulee_le = $2 WHERE email = $1 AND utilisee_le IS NULL AND annulee_le IS NULL",
      [adresse, maintenant],
    );
    const inseree = await client.query(
      "INSERT INTO invitation (email, role, jeton_hash, invite_par, cree_le, expire_le) " +
        "VALUES ($1, 'super_admin', $2, NULL, $3, $4) RETURNING id",
      [adresse, sha256Hex(jeton), maintenant, expireLe],
    );
    const invitationId = inseree.rows[0].id;
    await client.query(
      "INSERT INTO journal (acteur_type, acteur_id, action, cible, details, cree_le) " +
        "VALUES ('systeme', NULL, 'comptes.inviter', $1, $2, $3)",
      [`invitation:${invitationId}`, JSON.stringify({ role: "super_admin", origine: "script" }), maintenant],
    );
    await client.query("COMMIT");
    return { lien: new URL(`/activation/${jeton}`, base).toString(), expireLe, invitationId };
  } catch (erreur) {
    await client.query("ROLLBACK");
    throw erreur;
  } finally {
    client.release();
  }
}

async function main() {
  const [email, ...reste] = process.argv.slice(2);
  if (!email || reste.length > 0) {
    console.error("Usage : npm run admin:creer -- <email>");
    process.exitCode = 1;
    return;
  }
  const databaseUrl = process.env.DATABASE_URL;
  const appUrl = process.env.APP_URL;
  if (!databaseUrl || !appUrl) {
    console.error("[admin:creer] DATABASE_URL et APP_URL sont obligatoires.");
    process.exitCode = 1;
    return;
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const { lien, expireLe } = await creerInvitationSuperAdmin(pool, { email, appUrl });
    console.log("Invitation du super-admin créée.");
    console.log("");
    console.log(`  Lien d'activation : ${lien}`);
    console.log(`  Valable jusqu'au  : ${expireLe.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}`);
    console.log("");
    console.log(
      "Ce lien ne sera plus affiché. Ouvre-le pour choisir ton mot de passe et configurer la double authentification.",
    );
  } catch (erreur) {
    console.error(
      erreur instanceof ErreurScript
        ? `[admin:creer] ${erreur.message}`
        : `[admin:creer] Échec : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
