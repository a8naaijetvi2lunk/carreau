"use client";

import { useActionState, useState } from "react";
import { Alerte, Bouton, Champ, ErreurFormulaire } from "@/components/ui";
import { erreursParChamp } from "@/lib/formulaire";
import { enregistrerConservationAction } from "./actions";

export function FormulaireConservation(props: {
  evenements: number | null;
  resultats: number | null;
  contact: string;
}) {
  const [etat, action, enCours] = useActionState(enregistrerConservationAction, null);
  const [evenements, setEvenements] = useState(props.evenements === null ? "" : String(props.evenements));
  const [resultats, setResultats] = useState(props.resultats === null ? "" : String(props.resultats));
  const [contact, setContact] = useState(props.contact);
  const erreurs = etat && !etat.ok ? erreursParChamp(etat.erreur.details) : {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <ErreurFormulaire etat={etat} />
      {etat?.ok ? <Alerte ton="succes">Conservation des données enregistrée.</Alerte> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ
          id="conservationEvenementsJours"
          name="conservationEvenementsJours"
          type="number"
          inputMode="numeric"
          min={1}
          max={3650}
          libelle="Événements enregistrés (jours)"
          value={evenements}
          onChange={(evenement) => setEvenements(evenement.target.value)}
          erreur={erreurs.conservationEvenementsJours}
        />
        <Champ
          id="conservationResultatsJours"
          name="conservationResultatsJours"
          type="number"
          inputMode="numeric"
          min={1}
          max={3650}
          libelle="Résultats et notes (jours)"
          value={resultats}
          onChange={(evenement) => setResultats(evenement.target.value)}
          erreur={erreurs.conservationResultatsJours}
        />
      </div>
      <Champ
        id="contactDonnees"
        name="contactDonnees"
        libelle="Contact affiché aux étudiants"
        aide="Par exemple l’adresse du délégué à la protection des données de l’établissement."
        value={contact}
        onChange={(evenement) => setContact(evenement.target.value)}
        erreur={erreurs.contactDonnees}
      />
      <div>
        <Bouton type="submit" disabled={enCours}>
          Enregistrer
        </Bouton>
      </div>
    </form>
  );
}
