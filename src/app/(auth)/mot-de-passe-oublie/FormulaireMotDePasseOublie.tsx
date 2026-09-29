"use client";

import { useActionState, useState } from "react";
import { Alerte, Bouton, Champ, ErreurFormulaire } from "@/components/ui";
import { erreursParChamp } from "@/lib/formulaire";
import { demanderReinitialisationAction } from "./actions";

export function FormulaireMotDePasseOublie() {
  const [etat, action, enCours] = useActionState(demanderReinitialisationAction, null);
  const [email, setEmail] = useState("");
  const erreurs = etat && !etat.ok ? erreursParChamp(etat.erreur.details) : {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <ErreurFormulaire etat={etat} />
      {etat?.ok ? (
        <Alerte ton="succes">
          Si un compte correspond à cette adresse, un email vient de partir. Pense à regarder dans les
          courriers indésirables.
        </Alerte>
      ) : null}
      <Champ
        id="email"
        name="email"
        type="email"
        libelle="Adresse email"
        autoComplete="username"
        value={email}
        onChange={(evenement) => setEmail(evenement.target.value)}
        erreur={erreurs.email}
      />
      <Bouton type="submit" disabled={enCours}>
        {enCours ? "Envoi…" : "Envoyer le lien"}
      </Bouton>
    </form>
  );
}
