"use client";

import { useActionState } from "react";
import { Bouton, Champ, ErreurFormulaire } from "@/components/ui";
import { erreursParChamp } from "@/lib/formulaire";
import { validerDoubleAuthAction } from "./actions";

export function FormulaireDoubleAuth() {
  const [etat, action, enCours] = useActionState(validerDoubleAuthAction, null);
  const erreurs = etat && !etat.ok ? erreursParChamp(etat.erreur.details) : {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <ErreurFormulaire etat={etat} />
      <Champ
        id="code"
        name="code"
        libelle="Code à 6 chiffres"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        className="font-code text-lg tracking-[0.3em]"
        erreur={erreurs.code}
      />
      <Bouton type="submit" disabled={enCours}>
        {enCours ? "Vérification…" : "Valider"}
      </Bouton>
    </form>
  );
}
