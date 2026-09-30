/**
 * Purge des données d'examen selon la conservation (spec §9.4, lot 10 ; décision D1 et amendements A1
 * et A2 du plan). Fin d'une session : `termine_le` (terminée ou annulée), `cree_le` (salle d'attente
 * jamais démarrée) ; une session en cours n'a pas de fin et n'est jamais purgée. SQL brut : noms de
 * tables et de colonnes en clair, instant applicatif en paramètre (jamais now()).
 */
import "server-only";
import { and, inArray, ne, or, sql } from "drizzle-orm";
import { db, type Executeur } from "@/db";
import { sessionExamen } from "@/db/schema";

/** `instant` moins `jours` jours, en paramètres SQL. */
function limiteJours(instant: Date, jours: number) {
  return sql`${instant.toISOString()}::timestamptz - make_interval(days => ${Math.trunc(jours)}::int)`;
}

/** Événements des sessions finies depuis au moins `jours` jours ; l'indice des participations reste. */
export async function purgerEvenements(jours: number, instant: Date): Promise<number> {
  const resultat = await db().execute(sql`
    delete from evenement e
    using participation p, session_examen s
    where e.participation_id = p.id
      and p.session_id = s.id
      and s.statut in ('terminee', 'annulee')
      and s.termine_le <= ${limiteJours(instant, jours)}`);
  return resultat.rowCount ?? 0;
}

/** Sessions de classe dont le groupe (elle et ses rattrapages) est fini depuis au moins `jours` jours. */
async function groupesEchus(executeur: Executeur, jours: number, instant: Date): Promise<string[]> {
  const { rows } = await executeur.execute<{ racine: string }>(sql`
    select coalesce(s.session_origine_id, s.id) as racine
    from session_examen s
    group by coalesce(s.session_origine_id, s.id)
    having bool_and(
        (case when s.statut in ('terminee', 'annulee') then s.termine_le
              when s.statut = 'attente' then s.cree_le end) is not null)
      and max(case when s.statut in ('terminee', 'annulee') then s.termine_le
                   when s.statut = 'attente' then s.cree_le end) <= ${limiteJours(instant, jours)}`);
  return rows.map((ligne) => ligne.racine);
}

/**
 * Supprime les groupes échus (amendement A2) : rattrapages d'abord (clé `session_origine_id` en
 * RESTRICT), puis la session de classe ; la cascade emporte participations, réponses, événements,
 * demandes d'appareil et autorisations. Sous verrou de tout le groupe — la session de classe et ses
 * rattrapages —, comme la création d'un rattrapage (qui verrouille la session de classe) et son
 * démarrage (qui verrouille le rattrapage) : un rattrapage créé ou démarré entre-temps rouvre ou
 * protège son groupe, recalculé après le verrou. Défense en profondeur : une session `en_cours` qui
 * aurait échappé au recalcul n'est jamais supprimée (si c'est un rattrapage, la suppression de sa
 * session de classe échoue sur la clé RESTRICT et l'étape se refait la nuit suivante).
 */
export async function purgerSessions(jours: number, instant: Date): Promise<number> {
  const candidates = await groupesEchus(db(), jours, instant);
  if (candidates.length === 0) return 0;
  return db().transaction(async (tx) => {
    await tx
      .select({ id: sessionExamen.id })
      .from(sessionExamen)
      .where(or(inArray(sessionExamen.id, candidates), inArray(sessionExamen.sessionOrigineId, candidates)))
      .for("update");
    const echus = (await groupesEchus(tx, jours, instant)).filter((id) => candidates.includes(id));
    if (echus.length === 0) return 0;
    const rattrapages = await tx
      .delete(sessionExamen)
      .where(and(inArray(sessionExamen.sessionOrigineId, echus), ne(sessionExamen.statut, "en_cours")))
      .returning({ id: sessionExamen.id });
    const origines = await tx
      .delete(sessionExamen)
      .where(and(inArray(sessionExamen.id, echus), ne(sessionExamen.statut, "en_cours")))
      .returning({ id: sessionExamen.id });
    return rattrapages.length + origines.length;
  });
}
