/** Affichage des dates en heure de Paris (spec §4 : stockage en timestamptz, affichage Europe/Paris). */
const FORMAT_LONG = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});

const FORMAT_COURT = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});

/** « 29 septembre 2026 à 10:05 » : emails et messages. */
export function formaterDateHeure(date: Date): string {
  return FORMAT_LONG.format(date);
}

/** « 29/09/2026 10:05 » : tableaux. */
export function formaterDateCourte(date: Date): string {
  return FORMAT_COURT.format(date);
}

const FORMAT_HEURE = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

/** « 10:05 » : indicateur d'enregistrement de l'éditeur. */
export function formaterHeure(date: Date): string {
  return FORMAT_HEURE.format(date);
}

const FORMAT_HEURE_SECONDES = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Europe/Paris",
});

/** « 10:42:13 » : tableau de bord et alertes de la surveillance. */
export function formaterHeureSecondes(date: Date): string {
  return FORMAT_HEURE_SECONDES.format(date);
}

const FORMAT_JOUR = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Paris",
});

/** « lundi 28 septembre 2026 » : en-tête des résultats et du rapport. */
export function formaterJour(date: Date): string {
  return FORMAT_JOUR.format(date);
}

const FORMAT_JOUR_COURT = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Paris",
});

/** « 28 sept. » : axe du graphique d'évolution. */
export function formaterJourCourt(date: Date): string {
  return FORMAT_JOUR_COURT.format(date);
}

const FORMAT_PARTIES = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Paris",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** Instant → « 2026-09-30T08:30 » en heure de Paris (valeur d'un champ `datetime-local`). */
export function saisieHeureDeParis(date: Date): string {
  const parties: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const { type, value } of FORMAT_PARTIES.formatToParts(date)) parties[type] = value;
  return `${parties.year ?? ""}-${parties.month ?? ""}-${parties.day ?? ""}T${parties.hour ?? ""}:${parties.minute ?? ""}`;
}

const FORMAT_SAISIE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function composantes(saisie: string): [number, number, number, number, number] {
  return saisie.split(/[-T:]/).map(Number) as [number, number, number, number, number];
}

/** Écart (ms) entre l'heure de Paris et UTC à l'instant donné, à la minute près. */
function decalageParisMs(instant: number): number {
  const [annee, mois, jour, heure, minute] = composantes(saisieHeureDeParis(new Date(instant)));
  return Date.UTC(annee, mois - 1, jour, heure, minute) - Math.floor(instant / 60_000) * 60_000;
}

/**
 * « 2026-09-30T08:30 » saisi dans un champ `datetime-local`, lu en heure de Paris → instant (créneau
 * d'une session, décision D3 du plan du lot 4). Null si la saisie est mal formée ou désigne une heure
 * qui n'existe pas (31 février, 02:30 le jour du passage à l'heure d'été). Une heure répétée (passage
 * à l'heure d'hiver) désigne la seconde.
 */
export function dateDepuisHeureDeParis(saisie: string): Date | null {
  if (!FORMAT_SAISIE.test(saisie)) return null;
  const [annee, mois, jour, heure, minute] = composantes(saisie);
  const commeUtc = Date.UTC(annee, mois - 1, jour, heure, minute);
  // Deux passes : le décalage dépend de l'instant cherché (heure d'été ou d'hiver).
  const approche = commeUtc - decalageParisMs(commeUtc);
  const date = new Date(commeUtc - decalageParisMs(approche));
  return saisieHeureDeParis(date) === saisie ? date : null;
}
