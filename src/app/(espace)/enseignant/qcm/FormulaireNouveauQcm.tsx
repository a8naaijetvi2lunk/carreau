"use client";

import { useActionState, useState } from "react";
import { Bouton, Champ, ErreurFormulaire } from "@/components/ui";
import { erreursParChamp } from "@/lib/formulaire";
import { LIMITES_QCM } from "@/lib/regles-qcm";
import { creerQcmAction } from "./actions";

export function FormulaireNouveauQcm() {
  const [etat, action, enCours] = useActionState(creerQcmAction, null);
  const [titre, setTitre] = useState("");
  const erreurs = etat && !etat.ok ? erreursParChamp(etat.erreur.details) : {};
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-3" noValidate>
        <Champ
          id="titre-qcm"
          name="titre"
          libelle="Titre du QCM"
          autoComplete="off"
          placeholder="Algorithmique — Contrôle 2"
          maxLength={LIMITES_QCM.titreMax}
          value={titre}
          onChange={(evenement) => setTitre(evenement.target.value)}
          erreur={erreurs.titre}
        />
        <Bouton type="submit" disabled={enCours} className="self-start">
          Créer le QCM
        </Bouton>
      </form>
      <ErreurFormulaire etat={etat} />
    </div>
  );
}
