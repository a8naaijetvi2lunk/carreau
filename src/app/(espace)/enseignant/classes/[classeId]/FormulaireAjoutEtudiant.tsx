"use client";

import { useActionState, useState } from "react";
import { Alerte, Bouton, Champ, ErreurFormulaire } from "@/components/ui";
import type { ResultatAction } from "@/lib/action";
import { erreursParChamp } from "@/lib/formulaire";
import { ajouterEtudiantAction } from "../actions";
import type { ResultatMessage } from "../types";

export function FormulaireAjoutEtudiant({ classeId }: { classeId: string }) {
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [tiersTemps, setTiersTemps] = useState(false);
  const [etat, action, enCours] = useActionState(
    async (precedent: ResultatAction<ResultatMessage> | null, formulaire: FormData) => {
      const resultat = await ajouterEtudiantAction(precedent, formulaire);
      if (resultat.ok) {
        setNom("");
        setPrenom("");
        setTiersTemps(false);
      }
      return resultat;
    },
    null,
  );
  const erreurs = etat && !etat.ok ? erreursParChamp(etat.erreur.details) : {};
  return (
    <section aria-labelledby="ajouter-etudiant" className="flex flex-col gap-3">
      <h3 id="ajouter-etudiant" className="text-base font-bold">
        Ajouter un étudiant
      </h3>
      <form action={action} className="flex flex-col gap-3 md:flex-row md:items-start" noValidate>
        <input type="hidden" name="classeId" value={classeId} />
        <div className="md:flex-1">
          <Champ
            id="ajout-nom"
            name="nom"
            libelle="Nom"
            autoComplete="off"
            maxLength={100}
            value={nom}
            onChange={(evenement) => setNom(evenement.target.value)}
            erreur={erreurs.nom}
          />
        </div>
        <div className="md:flex-1">
          <Champ
            id="ajout-prenom"
            name="prenom"
            libelle="Prénom"
            autoComplete="off"
            maxLength={100}
            value={prenom}
            onChange={(evenement) => setPrenom(evenement.target.value)}
            erreur={erreurs.prenom}
          />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-[15px] md:mt-[25px]">
          <input
            type="checkbox"
            name="tiersTemps"
            checked={tiersTemps}
            onChange={(evenement) => setTiersTemps(evenement.target.checked)}
            className="size-5 accent-bleu"
          />
          Tiers-temps
        </label>
        <Bouton type="submit" disabled={enCours} className="md:mt-[25px]">
          Ajouter l’étudiant
        </Bouton>
      </form>
      <ErreurFormulaire etat={etat} />
      {etat?.ok ? <Alerte ton="succes">{etat.donnees.message}</Alerte> : null}
    </section>
  );
}
