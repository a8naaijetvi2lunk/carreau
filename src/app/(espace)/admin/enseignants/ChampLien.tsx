"use client";

import { useId, useState } from "react";
import { Bouton } from "@/components/ui";

/** Lien d'invitation affiché une fois, à copier et transmettre à la personne invitée. */
export function ChampLien({ lien }: { lien: string }) {
  const id = useId();
  const [copie, setCopie] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-bold text-encre-2">
        Lien d’invitation
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          readOnly
          value={lien}
          onFocus={(evenement) => evenement.currentTarget.select()}
          className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-ligne bg-papier px-3 font-code text-sm"
        />
        <Bouton
          variante="secondaire"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(lien);
              setCopie(true);
            } catch {
              setCopie(false);
            }
          }}
        >
          {copie ? "Copié" : "Copier"}
        </Bouton>
      </div>
      <p className="text-[13px] text-muet">
        Lien personnel et à usage unique : ne le transmets qu’à la personne invitée.
      </p>
    </div>
  );
}
