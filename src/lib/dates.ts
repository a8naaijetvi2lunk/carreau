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
