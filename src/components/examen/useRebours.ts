import { useEffect, useRef, useState } from "react";
import { secondesAvant } from "@/lib/horloge-serveur";

export type Rebours = { secondes: number; commenceA: number | null };

/**
 * Secondes avant `demarreLe` (spec §6.3), calées sur l'heure du serveur par `decalageMs` et
 * recalculées toutes les 200 ms par une minuterie : aucune date n'est lue au rendu (React Compiler).
 * `commenceA` : heure locale (ms) du premier passage à zéro pour ce démarrage, gardée quand le
 * décalage est remesuré à chaque interrogation. Null avant la première mesure.
 */
export function useRebours(demarreLe: string, decalageMs: number): Rebours | null {
  const [rebours, setRebours] = useState<Rebours | null>(null);
  const passage = useRef<{ demarreLe: string; a: number } | null>(null);

  useEffect(() => {
    let annule = false;
    const tic = () => {
      if (annule) return;
      const maintenant = Date.now();
      const secondes = secondesAvant(demarreLe, decalageMs, maintenant);
      if (secondes === 0 && passage.current?.demarreLe !== demarreLe) {
        passage.current = { demarreLe, a: maintenant };
      }
      setRebours({
        secondes,
        commenceA: passage.current?.demarreLe === demarreLe ? passage.current.a : null,
      });
    };
    const premier = window.setTimeout(tic, 0);
    const minuterie = window.setInterval(tic, 200);
    return () => {
      annule = true;
      window.clearTimeout(premier);
      window.clearInterval(minuterie);
    };
  }, [demarreLe, decalageMs]);

  return rebours;
}
