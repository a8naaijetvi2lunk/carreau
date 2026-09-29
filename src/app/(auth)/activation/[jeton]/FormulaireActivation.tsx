"use client";

import { useActionState, useState } from "react";
import { Bouton, Champ, ErreurFormulaire } from "@/components/ui";
import type { ResultatAction } from "@/lib/action";
import { erreursParChamp } from "@/lib/formulaire";

type Action = (etat: ResultatAction<null> | null, formulaire: FormData) => Promise<ResultatAction<null>>;

export function FormulaireActivation({ action }: { action: Action }) {
  const [etat, envoyer, enCours] = useActionState(action, null);
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const erreurs = etat && !etat.ok ? erreursParChamp(etat.erreur.details) : {};
  return (
    <form action={envoyer} className="flex flex-col gap-4" noValidate>
      <ErreurFormulaire etat={etat} />
      <Champ
        id="prenom"
        name="prenom"
        libelle="Prénom"
        autoComplete="given-name"
        value={prenom}
        onChange={(evenement) => setPrenom(evenement.target.value)}
        erreur={erreurs.prenom}
      />
      <Champ
        id="nom"
        name="nom"
        libelle="Nom"
        autoComplete="family-name"
        value={nom}
        onChange={(evenement) => setNom(evenement.target.value)}
        erreur={erreurs.nom}
      />
      <Champ
        id="motDePasse"
        name="motDePasse"
        type="password"
        libelle="Mot de passe"
        autoComplete="new-password"
        aide="12 caractères au moins. Une phrase de plusieurs mots est facile à retenir et difficile à deviner."
        erreur={erreurs.motDePasse}
      />
      <Champ
        id="confirmation"
        name="confirmation"
        type="password"
        libelle="Confirmation du mot de passe"
        autoComplete="new-password"
        erreur={erreurs.confirmation}
      />
      <Bouton type="submit" disabled={enCours}>
        {enCours ? "Activation…" : "Activer mon compte"}
      </Bouton>
    </form>
  );
}
