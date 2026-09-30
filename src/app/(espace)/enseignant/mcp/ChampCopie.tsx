"use client";

import { useState } from "react";
import { Bouton } from "@/components/ui";

/** Valeur en lecture seule à copier (adresse du serveur, jeton affiché une seule fois). */
export function ChampCopie({
  id,
  libelle,
  valeur,
  libelleBouton,
}: {
  id: string;
  libelle: string;
  valeur: string;
  /** Nom accessible du bouton, qui commence par « Copier » (plusieurs boutons sur la page). */
  libelleBouton: string;
}) {
  const [copie, setCopie] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-bold text-encre-2">
        {libelle}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          readOnly
          value={valeur}
          onFocus={(evenement) => evenement.currentTarget.select()}
          className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-ligne bg-papier px-3 font-code text-sm"
        />
        <Bouton
          variante="secondaire"
          aria-label={libelleBouton}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(valeur);
              setCopie(true);
            } catch {
              setCopie(false);
            }
          }}
        >
          {copie ? "Copié" : "Copier"}
        </Bouton>
      </div>
    </div>
  );
}
