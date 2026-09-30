/**
 * Purge des comptes et traces techniques (spec §14, lot 10 ; décision D2 et amendements A3 et A4 du
 * plan). SQL brut, instant applicatif en paramètre (jamais now()).
 */
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { CONSERVATION_INVITATIONS_CLOSES_JOURS, CONSERVATION_JOURNAL_MOIS } from "@/lib/regles-purges";
import { DUREE_INACTIVITE_MS } from "@/modules/auth";

function instantSql(instant: Date) {
  return sql`${instant.toISOString()}::timestamptz`;
}

/** Sessions de connexion expirées, ou inactives depuis 30 min sans « Rester connecté ». */
export async function purgerConnexions(instant: Date): Promise<number> {
  const inactiveAvant = instantSql(new Date(instant.getTime() - DUREE_INACTIVITE_MS));
  const resultat = await db().execute(sql`
    delete from session_connexion
    where expire_le <= ${instantSql(instant)}
       or (not rester_connecte and derniere_activite_le < ${inactiveAvant})`);
  return resultat.rowCount ?? 0;
}

/** Liens de réinitialisation utilisés ou expirés. */
export async function purgerJetons(instant: Date): Promise<number> {
  const resultat = await db().execute(sql`
    delete from jeton_reinitialisation
    where utilise_le is not null or expire_le <= ${instantSql(instant)}`);
  return resultat.rowCount ?? 0;
}

/** Invitations utilisées ou annulées depuis 30 jours ; une invitation en attente, même expirée, reste. */
export async function purgerInvitations(instant: Date): Promise<number> {
  const resultat = await db().execute(sql`
    delete from invitation
    where coalesce(utilisee_le, annulee_le)
      <= ${instantSql(instant)} - make_interval(days => ${CONSERVATION_INVITATIONS_CLOSES_JOURS}::int)`);
  return resultat.rowCount ?? 0;
}

/** Entrées du journal d'audit de plus de 12 mois. */
export async function purgerJournal(instant: Date): Promise<number> {
  const resultat = await db().execute(sql`
    delete from journal
    where cree_le <= ${instantSql(instant)} - make_interval(months => ${CONSERVATION_JOURNAL_MOIS}::int)`);
  return resultat.rowCount ?? 0;
}
