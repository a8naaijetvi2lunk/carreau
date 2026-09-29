"use client";

import { useActionState, useState } from "react";
import { Alerte, Bouton, Champ, ErreurFormulaire } from "@/components/ui";
import { erreursParChamp } from "@/lib/formulaire";
import { enregistrerEnvoiAction } from "./actions";

export function FormulaireEnvoi(props: {
  resendConfiguree: boolean;
  emailExpediteur: string;
  nomExpediteur: string;
}) {
  const [etat, action, enCours] = useActionState(enregistrerEnvoiAction, null);
  const [email, setEmail] = useState(props.emailExpediteur);
  const [nom, setNom] = useState(props.nomExpediteur);
  const erreurs = etat && !etat.ok ? erreursParChamp(etat.erreur.details) : {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <ErreurFormulaire etat={etat} />
      {etat?.ok ? <Alerte ton="succes">Paramètres d’envoi enregistrés.</Alerte> : null}
      <Champ
        id="cleApi"
        name="cleApi"
        type="password"
        libelle="Clé API Resend"
        autoComplete="off"
        placeholder={props.resendConfiguree ? "Laisser vide pour garder la clé enregistrée" : "re_…"}
        aide="Chiffrée en base, jamais réaffichée."
        className="font-code"
        erreur={erreurs.cleApi}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ
          id="emailExpediteur"
          name="emailExpediteur"
          type="email"
          libelle="Adresse d’expéditeur"
          value={email}
          onChange={(evenement) => setEmail(evenement.target.value)}
          erreur={erreurs.emailExpediteur}
        />
        <Champ
          id="nomExpediteur"
          name="nomExpediteur"
          libelle="Nom affiché"
          value={nom}
          onChange={(evenement) => setNom(evenement.target.value)}
          erreur={erreurs.nomExpediteur}
        />
      </div>
      <div>
        <Bouton type="submit" disabled={enCours}>
          Enregistrer
        </Bouton>
      </div>
    </form>
  );
}
