"use client";

import { useActionState } from "react";
import { Bouton, Champ, ErreurFormulaire } from "@/components/ui";
import type { ResultatAction } from "@/lib/action";
import { erreursParChamp } from "@/lib/formulaire";

type Action = (etat: ResultatAction<null> | null, formulaire: FormData) => Promise<ResultatAction<null>>;

export function FormulaireReinitialisation({ action }: { action: Action }) {
  const [etat, envoyer, enCours] = useActionState(action, null);
  const erreurs = etat && !etat.ok ? erreursParChamp(etat.erreur.details) : {};
  return (
    <form action={envoyer} className="flex flex-col gap-4" noValidate>
      <ErreurFormulaire etat={etat} />
      <Champ
        id="motDePasse"
        name="motDePasse"
        type="password"
        libelle="Mot de passe"
        autoComplete="new-password"
        aide="12 caractères au moins."
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
        {enCours ? "Enregistrement…" : "Enregistrer le mot de passe"}
      </Bouton>
    </form>
  );
}
