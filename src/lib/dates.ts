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
