"use client";

import { useActionState, useState } from "react";
import { Bouton } from "@/components/ui";
import { revoquerJetonAction } from "./actions";

/** Révocation en deux temps : un jeton révoqué ne revient pas. */
export function BoutonRevoquer({ jetonId, nom }: { jetonId: string; nom: string }) {
  const [confirmation, setConfirmation] = useState(false);
  const [etat, envoyer, enCours] = useActionState(revoquerJetonAction, null);
  if (!confirmation) {
    return (
      <Bouton
        variante="danger"
        aria-label={`Révoquer le jeton « ${nom} »`}
        onClick={() => setConfirmation(true)}
      >
        Révoquer
      </Bouton>
    );
  }
  return (
    <form action={envoyer} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="jetonId" value={jetonId} />
      <Bouton
        type="submit"
        variante="danger"
        disabled={enCours}
        aria-label={`Oui, révoquer le jeton « ${nom} »`}
      >
        Oui, révoquer
      </Bouton>
      <Bouton variante="secondaire" onClick={() => setConfirmation(false)}>
        Annuler
      </Bouton>
      {etat && !etat.ok ? (
        <p role="alert" className="w-full text-[13px] font-bold text-orange-fonce">
          {etat.erreur.message}
        </p>
      ) : null}
    </form>
  );
}
