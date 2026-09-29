"use client";

import { useActionState, useState } from "react";
import { Alerte, Bouton, ErreurFormulaire, Selection } from "@/components/ui";
import { erreursParChamp } from "@/lib/formulaire";
import { enregistrerValiditeAction } from "./actions";

const CHOIX = [3, 7, 14];

export function FormulaireValidite({ validite }: { validite: number }) {
  const [etat, action, enCours] = useActionState(enregistrerValiditeAction, null);
  const [valeur, setValeur] = useState(String(validite));
  const choix = CHOIX.includes(validite) ? CHOIX : [...CHOIX, validite].sort((a, b) => a - b);
  const erreurs = etat && !etat.ok ? erreursParChamp(etat.erreur.details) : {};
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <ErreurFormulaire etat={etat} />
      {etat?.ok ? <Alerte ton="succes">Validité des invitations enregistrée.</Alerte> : null}
      <Selection
        id="validiteInvitationJours"
        name="validiteInvitationJours"
        libelle="Validité d’un lien d’invitation"
        value={valeur}
        onChange={(evenement) => setValeur(evenement.target.value)}
        options={choix.map((jours) => ({ valeur: String(jours), libelle: `${jours} jours` }))}
        erreur={erreurs.validiteInvitationJours}
      />
      <div>
        <Bouton type="submit" disabled={enCours}>
          Enregistrer
        </Bouton>
      </div>
    </form>
  );
}
