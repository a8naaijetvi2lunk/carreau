"use client";

import { useRebours } from "@/components/examen/useRebours";
import type { EtatEntree } from "@/lib/vue-entree";

type EtatDemarrage = Extract<EtatEntree, { etape: "demarrage" }>;

/**
 * Départ commun (spec §6.3, décision D12) : compte à rebours calé sur l'heure du serveur, puis
 * « L’examen a commencé » (l'écran des questions arrive au lot 5). `data-commence-a` : heure locale du
 * passage à zéro, comparée d'un téléphone à l'autre par les tests de bout en bout.
 */
export function EtapeDemarrage({ etat, decalageMs }: { etat: EtatDemarrage; decalageMs: number }) {
  const rebours = useRebours(etat.demarreLe, decalageMs);
  if (!rebours) {
    return (
      <p role="status" className="text-encre-2">
        Préparation du départ…
      </p>
    );
  }
  if (rebours.secondes > 0) {
    return (
      <section
        data-etat="compte-a-rebours"
        className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
      >
        <h1 className="font-titre text-[32px] leading-[1.05] font-extrabold tracking-tight">
          L’examen commence dans
        </h1>
        <p role="timer" className="font-titre text-[96px] leading-none font-extrabold">
          {rebours.secondes}
        </p>
        <p className="text-base text-encre-2">
          Reste sur cette page, {etat.prenom} : tout le monde commence en même temps.
        </p>
      </section>
    );
  }
  return (
    <section
      data-etat="commence"
      data-commence-a={rebours.commenceA ?? undefined}
      className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
    >
      <h1 className="font-titre text-[32px] leading-[1.05] font-extrabold tracking-tight">
        L’examen a commencé
      </h1>
      <p className="text-base text-encre-2">Garde cette page ouverte.</p>
    </section>
  );
}
