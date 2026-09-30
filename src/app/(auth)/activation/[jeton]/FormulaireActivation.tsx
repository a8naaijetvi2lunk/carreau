"use client";

import { useActionState } from "react";
import { Bouton, Champ, ErreurFormulaire } from "@/components/ui";
import { erreursParChamp } from "@/lib/formulaire";
import type { EtatActivation } from "./etat";

type Action = (etat: EtatActivation | null, formulaire: FormData) => Promise<EtatActivation>;

/**
 * Prénom et nom non contrôlés (décision D9 du plan du lot 10) : une saisie ou un remplissage
 * automatique faits avant l'hydratation restent en place. Après une erreur, React remet le formulaire
 * sur ses valeurs par défaut, qui sont celles que l'action renvoie ; les mots de passe repartent vides.
 */
export function FormulaireActivation({ action }: { action: Action }) {
  const [etat, envoyer, enCours] = useActionState(action, null);
  const erreurs = etat && !etat.ok ? erreursParChamp(etat.erreur.details) : {};
  return (
    <form action={envoyer} className="flex flex-col gap-4" noValidate>
      <ErreurFormulaire etat={etat} />
      <Champ
        id="prenom"
        name="prenom"
        libelle="Prénom"
        autoComplete="given-name"
        defaultValue={etat?.valeurs.prenom ?? ""}
        erreur={erreurs.prenom}
      />
      <Champ
        id="nom"
        name="nom"
        libelle="Nom"
        autoComplete="family-name"
        defaultValue={etat?.valeurs.nom ?? ""}
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
