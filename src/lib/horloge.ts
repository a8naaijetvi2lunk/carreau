/**
 * Source du temps (spec §3.3). `modules` et `moteur` n'appellent jamais `Date.now()` :
 * ils passent par `maintenant()`, que les tests remplacent par une horloge figée.
 */
export type Horloge = { maintenant(): Date };

export const horlogeSysteme: Horloge = { maintenant: () => new Date() };

let horlogeCourante: Horloge = horlogeSysteme;

/** Heure courante du serveur. */
export function maintenant(): Date {
  return horlogeCourante.maintenant();
}

/** Horloge figée, avançable à la main (tests). */
export function horlogeFixe(
  depart: Date | number,
): Horloge & { avancer(ms: number): void; fixer(date: Date | number): void } {
  let courant = typeof depart === "number" ? depart : depart.getTime();
  return {
    maintenant: () => new Date(courant),
    avancer(ms: number) {
      courant += ms;
    },
    fixer(date: Date | number) {
      courant = typeof date === "number" ? date : date.getTime();
    },
  };
}

/** Remplace l'horloge (tests uniquement). Sans argument, rétablit l'horloge système. */
export function definirHorlogePourLesTests(horloge?: Horloge): void {
  horlogeCourante = horloge ?? horlogeSysteme;
}
