"use client";

import { useActionState } from "react";
import { Alerte, Bouton, ErreurFormulaire, Selection } from "@/components/ui";
import { envoyerEmailTestAction } from "./actions";

export function FormulaireEmailTest({ modeles }: { modeles: { valeur: string; libelle: string }[] }) {
  const [etat, action, enCours] = useActionState(envoyerEmailTestAction, null);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <ErreurFormulaire etat={etat} />
      {etat?.ok ? <Alerte ton="succes">Email de test envoyé à ton adresse.</Alerte> : null}
      <Selection id="modele" name="modele" libelle="Modèle" options={modeles} />
      <div>
        <Bouton type="submit" variante="secondaire" disabled={enCours}>
          Envoyer un email de test
        </Bouton>
      </div>
    </form>
  );
}
