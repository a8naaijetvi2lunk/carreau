import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { limiteur } from "@/db/schema";
import { ErreurService, erreurs } from "@/lib/erreurs";
import { maintenant } from "@/lib/horloge";
import { journaliser } from "@/modules/journal";

/** Règle d'une clé du limiteur (spec §11.2). */
export type RegleLimite = {
  /** Essais autorisés dans la fenêtre ; l'essai suivant est refusé. */
  seuil: number;
  /** Durée de la fenêtre de comptage, en secondes. */
  fenetreSecondes: number;
  /** Durée du blocage posé quand le seuil est atteint, en secondes. */
  blocageSecondes: number;
};

/** Message affiché pendant un blocage (délai arrondi à la minute supérieure). */
export function messageLimite(secondes: number): string {
  const minutes = Math.max(1, Math.ceil(secondes / 60));
  return `Trop de tentatives. Réessaie dans ${minutes} minute${minutes > 1 ? "s" : ""}.`;
}

function verifierRegle(regle: RegleLimite): void {
  for (const [nom, valeur] of Object.entries(regle)) {
    if (!Number.isInteger(valeur) || valeur < 1) {
      throw new Error(`Règle de limiteur invalide : ${nom} = ${String(valeur)}`);
    }
  }
}

/** Instant courant, passé en paramètre SQL (jamais `now()`, jamais une Date brute dans `sql`). */
function instantSql() {
  return sql`${maintenant().toISOString()}::timestamptz`;
}

/**
 * Compte un essai pour `cle` et lève LIMITE_ATTEINTE s'il dépasse le seuil.
 * Upsert atomique : des essais simultanés sont sérialisés par le verrou de ligne, et au
 * plus `seuil` passent. Le `seuil`-ième essai pose le blocage mais passe encore. Pendant un
 * blocage, le compteur est figé à `seuil + 1` et le blocage n'est pas prolongé. Une fenêtre
 * expirée ou un blocage terminé font repartir le compteur à 1.
 */
export async function reserver(cle: string, regle: RegleLimite): Promise<void> {
  verifierRegle(regle);
  const l = limiteur;
  const instant = instantSql();
  const fenetre = sql`make_interval(secs => ${regle.fenetreSecondes}::int)`;
  const blocage = sql`make_interval(secs => ${regle.blocageSecondes}::int)`;
  const bloqueActif = sql`(${l.bloqueJusquAu} IS NOT NULL AND ${l.bloqueJusquAu} > ${instant})`;
  const blocageEchu = sql`(${l.bloqueJusquAu} IS NOT NULL AND ${l.bloqueJusquAu} <= ${instant})`;
  const fenetreExpiree = sql`${l.fenetreDebut} <= ${instant} - ${fenetre}`;
  const redemarrer = sql`(NOT ${bloqueActif} AND (${fenetreExpiree} OR ${blocageEchu}))`;
  const blocageInitial = regle.seuil <= 1 ? sql`${instant} + ${blocage}` : sql`NULL::timestamptz`;

  const [etat] = await db()
    .insert(l)
    .values({ cle, compteur: 1, fenetreDebut: instant, bloqueJusquAu: blocageInitial })
    .onConflictDoUpdate({
      target: l.cle,
      set: {
        fenetreDebut: sql`CASE WHEN ${redemarrer} THEN ${instant} ELSE ${l.fenetreDebut} END`,
        compteur: sql`CASE
          WHEN ${bloqueActif} THEN GREATEST(${l.compteur}, ${regle.seuil + 1}::int)
          WHEN ${redemarrer} THEN 1
          ELSE ${l.compteur} + 1 END`,
        bloqueJusquAu: sql`CASE
          WHEN ${bloqueActif} THEN ${l.bloqueJusquAu}
          WHEN ${redemarrer} THEN ${blocageInitial}
          WHEN ${l.compteur} + 1 >= ${regle.seuil}::int THEN ${instant} + ${blocage}
          ELSE NULL END`,
      },
    })
    .returning({
      compteur: l.compteur,
      secondes: sql<number | null>`ceil(extract(epoch from ${l.bloqueJusquAu} - ${instant}))::int`,
    });

  if (!etat || etat.compteur <= regle.seuil) return;
  const secondes = Math.max(1, etat.secondes ?? 1);
  throw erreurs.limiteAtteinte(messageLimite(secondes), secondes);
}

/**
 * Rend un essai (compteur − 1) et lève le blocage s'il repasse sous le seuil. Sert quand un
 * essai réussi ne doit pas compter (ex. clé IP après une connexion valide). Une clé revenue
 * à zéro sans blocage est supprimée.
 */
export async function annuler(cle: string, regle: RegleLimite): Promise<void> {
  verifierRegle(regle);
  const l = limiteur;
  await db()
    .update(l)
    .set({
      compteur: sql`GREATEST(${l.compteur} - 1, 0)`,
      bloqueJusquAu: sql`CASE WHEN ${l.compteur} - 1 < ${regle.seuil}::int THEN NULL ELSE ${l.bloqueJusquAu} END`,
    })
    .where(eq(l.cle, cle));
  // Conditionnel et atomique : une réservation concurrente (compteur ≥ 1) garde sa ligne.
  await db()
    .delete(l)
    .where(sql`${l.cle} = ${cle} AND ${l.compteur} = 0 AND ${l.bloqueJusquAu} IS NULL`);
}

/** Supprime les clés données (ex. compteur d'un compte après une connexion réussie). */
export async function effacer(cles: string[]): Promise<void> {
  if (cles.length === 0) return;
  await db().delete(limiteur).where(inArray(limiteur.cle, cles));
}

/**
 * Supprime les clés sans blocage actif dont la fenêtre a commencé il y a plus de
 * `ageSecondes`. Un blocage en cours n'est jamais levé. Renvoie le nombre supprimé.
 */
export async function purgerLimiteur(ageSecondes: number): Promise<number> {
  const l = limiteur;
  const instant = instantSql();
  const age = Math.max(1, Math.trunc(ageSecondes));
  const supprimees = await db()
    .delete(l)
    .where(
      sql`${l.fenetreDebut} <= ${instant} - make_interval(secs => ${age}::int)
          AND (${l.bloqueJusquAu} IS NULL OR ${l.bloqueJusquAu} <= ${instant})`,
    )
    .returning({ cle: l.cle });
  return supprimees.length;
}

/**
 * `reserver`, et journalise le refus avant de relancer LIMITE_ATTEINTE (spec §12 : tout
 * déclenchement du limiteur est journalisé). `cible` ne contient jamais de donnée personnelle
 * en clair (identifiant technique uniquement).
 */
export async function reserverJournalise(
  cle: string,
  regle: RegleLimite,
  journal: { action: string; cible?: string },
): Promise<void> {
  try {
    await reserver(cle, regle);
  } catch (erreur) {
    if (erreur instanceof ErreurService && erreur.code === "LIMITE_ATTEINTE") {
      await journaliser({ acteur: { type: "anonyme" }, action: journal.action, cible: journal.cible });
    }
    throw erreur;
  }
}
