"use client";

import { useActionState, useState } from "react";
import { Bouton, Champ, ErreurFormulaire } from "@/components/ui";
import { erreursParChamp } from "@/lib/formulaire";
import { creerClasseAction } from "./actions";

export function FormulaireNouvelleClasse() {
  const [etat, action, enCours] = useActionState(creerClasseAction, null);
  const [nom, setNom] = useState("");
  const erreurs = etat && !etat.ok ? erreursParChamp(etat.erreur.details) : {};
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-3 md:flex-row md:items-start" noValidate>
        <div className="md:flex-1">
          <Champ
            id="nom-classe"
            name="nom"
            libelle="Nom de la classe"
            autoComplete="off"
            placeholder="TD2"
            maxLength={60}
            value={nom}
            onChange={(evenement) => setNom(evenement.target.value)}
            erreur={erreurs.nom}
          />
        </div>
        <Bouton type="submit" disabled={enCours} className="md:mt-[25px]">
          Créer la classe
        </Bouton>
      </form>
      <ErreurFormulaire etat={etat} />
    </div>
  );
}
