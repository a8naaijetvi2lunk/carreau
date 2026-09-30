import { useEffect } from "react";
import { CaptureExamen, identifiantChargement } from "@/lib/capture-examen";
import { envoyerEvenements } from "./api";

/**
 * Ce chargement de la page (amendement A4) : un identifiant et une numérotation, partagés par toutes
 * les captures tant que la page n'est pas rechargée (un effet rejoué ne recommence pas à 1).
 */
let chargementDeLaPage: { id: string; numero: number } | null = null;

function chargementCourant(): { id: string; numero: number } {
  chargementDeLaPage ??= { id: identifiantChargement(), numero: 0 };
  return chargementDeLaPage;
}

/** Capture de la page d'examen (D8) : active de la première question jusqu'à l'écran de fin. */
export function useCaptureExamen(actif: boolean): void {
  useEffect(() => {
    if (!actif) return;
    const page = chargementCourant();
    const capture = new CaptureExamen({
      fenetre: window,
      document,
      chargement: page.id,
      numeroter: () => (page.numero += 1),
      envoyer: envoyerEvenements,
      maintenant: () => Date.now(),
    });
    capture.demarrer();
    return () => capture.arreter();
  }, [actif]);
}
