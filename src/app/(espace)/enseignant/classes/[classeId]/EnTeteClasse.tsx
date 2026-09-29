"use client";

import { useActionState, useState } from "react";
import { Bouton, Champ, ErreurFormulaire, Etiquette } from "@/components/ui";
import type { ResultatAction } from "@/lib/action";
import { erreursParChamp } from "@/lib/formulaire";
import { archiverClasseAction, renommerClasseAction, restaurerClasseAction } from "../actions";
import { BoutonAction } from "../BoutonAction";
import { libelleEffectif } from "../libelles";
import type { ResultatMessage } from "../types";

type ClasseAffichee = { id: string; nom: string; archivee: boolean };

function FormulaireRenommage({ classe, onTermine }: { classe: ClasseAffichee; onTermine: () => void }) {
  const [nom, setNom] = useState(classe.nom);
  const [etat, action, enCours] = useActionState(
    async (precedent: ResultatAction<ResultatMessage> | null, formulaire: FormData) => {
      const resultat = await renommerClasseAction(precedent, formulaire);
      if (resultat.ok) onTermine();
      return resultat;
    },
    null,
  );
  const erreurs = etat && !etat.ok ? erreursParChamp(etat.erreur.details) : {};
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-3 md:flex-row md:items-start" noValidate>
        <input type="hidden" name="classeId" value={classe.id} />
        <div className="md:flex-1">
          <Champ
            id="renommer-classe"
            name="nom"
            libelle="Nouveau nom de la classe"
            autoComplete="off"
            maxLength={60}
            value={nom}
            onChange={(evenement) => setNom(evenement.target.value)}
            erreur={erreurs.nom}
          />
        </div>
        <Bouton type="submit" disabled={enCours} className="md:mt-[25px]">
          Enregistrer
        </Bouton>
        <Bouton variante="secondaire" onClick={onTermine} className="md:mt-[25px]">
          Annuler
        </Bouton>
      </form>
      <ErreurFormulaire etat={etat} />
    </div>
  );
}

/** Nom de la classe, effectif, renommage et archivage (maquette « Classes », en-tête de droite). */
export function EnTeteClasse({
  classe,
  effectif,
  tiersTemps,
}: {
  classe: ClasseAffichee;
  effectif: number;
  tiersTemps: number;
}) {
  const [renommage, setRenommage] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="titre-classe" className="text-[22px] font-bold">
              {classe.nom}
            </h2>
            {classe.archivee ? <Etiquette>Archivée</Etiquette> : null}
          </div>
          <p className="text-sm text-encre-2">{libelleEffectif(effectif, tiersTemps)}</p>
        </div>
        {renommage ? null : (
          <Bouton variante="secondaire" onClick={() => setRenommage(true)}>
            Renommer
          </Bouton>
        )}
        <BoutonAction
          action={classe.archivee ? restaurerClasseAction : archiverClasseAction}
          champs={{ classeId: classe.id }}
        >
          {classe.archivee ? "Restaurer" : "Archiver"}
        </BoutonAction>
      </div>
      {renommage ? <FormulaireRenommage classe={classe} onTermine={() => setRenommage(false)} /> : null}
    </div>
  );
}
