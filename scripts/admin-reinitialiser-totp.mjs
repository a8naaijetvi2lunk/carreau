// Réinitialise la double authentification d'un compte (spec §9.2 : le super-admin qui perd son
// TOTP passe par le serveur) :
//
//   npm run admin:reinitialiser-totp -- prenom.nom@exemple.fr
//
// Le secret est effacé, les sessions fermées, les jetons MCP révoqués (amendement A1 du plan du
// lot 8) et les blocages du limiteur levés : le compte configure une nouvelle application à sa
// prochaine connexion. Le mot de passe ne change pas.
import { pathToFileURL } from "node:url";
import pg from "pg";
import { cleConnexionCompte, cleDoubleAuth, ErreurScript, normaliserEmail } from "./admin-commun.mjs";

/**
 * @param {pg.Pool} pool
 * @param {{ email: string; maintenant?: Date }} options
 * @returns {Promise<{ sessionsRevoquees: number; jetonsMcpRevoques: number }>}
 */
export async function reinitialiserTotp(pool, { email, maintenant = new Date() }) {
  const adresse = normaliserEmail(email);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const compte = await client.query(
      "UPDATE utilisateur SET totp_secret_chiffre = NULL, totp_dernier_pas = NULL WHERE email = $1 RETURNING id",
      [adresse],
    );
    if (compte.rows.length === 0) throw new ErreurScript("Aucun compte pour cette adresse.");
    const utilisateurId = compte.rows[0].id;
    const sessions = await client.query("DELETE FROM session_connexion WHERE utilisateur_id = $1", [
      utilisateurId,
    ]);
    const jetons = await client.query(
      "UPDATE jeton_mcp SET revoque_le = $2 WHERE enseignant_id = $1 AND revoque_le IS NULL",
      [utilisateurId, maintenant],
    );
    await client.query("DELETE FROM limiteur WHERE cle = ANY($1)", [
      [cleConnexionCompte(adresse), cleDoubleAuth(utilisateurId)],
    ]);
    await client.query(
      "INSERT INTO journal (acteur_type, acteur_id, action, cible, details, cree_le) " +
        "VALUES ('systeme', NULL, 'comptes.reinitialiser_double_auth', $1, $2, $3)",
      [`utilisateur:${utilisateurId}`, JSON.stringify({ origine: "script" }), maintenant],
    );
    await client.query("COMMIT");
    return { sessionsRevoquees: sessions.rowCount ?? 0, jetonsMcpRevoques: jetons.rowCount ?? 0 };
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
    console.error("Usage : npm run admin:reinitialiser-totp -- <email>");
    process.exitCode = 1;
    return;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[admin:reinitialiser-totp] DATABASE_URL est obligatoire.");
    process.exitCode = 1;
    return;
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const { sessionsRevoquees, jetonsMcpRevoques } = await reinitialiserTotp(pool, { email });
    console.log(
      `Double authentification réinitialisée (${sessionsRevoquees} session(s) fermée(s), ` +
        `${jetonsMcpRevoques} jeton(s) MCP révoqué(s)). Elle sera configurée à la prochaine connexion.`,
    );
  } catch (erreur) {
    console.error(
      erreur instanceof ErreurScript
        ? `[admin:reinitialiser-totp] ${erreur.message}`
        : `[admin:reinitialiser-totp] Échec : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
