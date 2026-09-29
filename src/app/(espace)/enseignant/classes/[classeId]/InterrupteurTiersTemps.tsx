"use client";

import { useActionState } from "react";
import { changerTiersTempsAction } from "../actions";

/** Interrupteur de la maquette : bouton `aria-pressed`, cible tactile de 44 px. */
export function InterrupteurTiersTemps({
  etudiantId,
  actif,
  nomComplet,
}: {
  etudiantId: string;
  actif: boolean;
  nomComplet: string;
}) {
  const [etat, envoyer, enCours] = useActionState(changerTiersTempsAction, null);
  return (
    <form action={envoyer} className="flex flex-col gap-1">
      <input type="hidden" name="etudiantId" value={etudiantId} />
      <input type="hidden" name="tiersTemps" value={actif ? "false" : "true"} />
      <button
        type="submit"
        aria-pressed={actif}
        aria-label={`Tiers-temps pour ${nomComplet}`}
        disabled={enCours}
        className="flex min-h-11 min-w-11 items-center disabled:opacity-60"
      >
        <span
          aria-hidden="true"
          className={`flex h-[26px] w-11 rounded-full p-[3px] transition-colors ${
            actif ? "justify-end bg-bleu" : "justify-start bg-muet"
          }`}
        >
          <span className="size-5 rounded-full bg-blanc" />
        </span>
      </button>
      {etat && !etat.ok ? (
        <p role="alert" className="text-[13px] font-bold text-orange-fonce">
          {etat.erreur.message}
        </p>
      ) : null}
    </form>
  );
}
