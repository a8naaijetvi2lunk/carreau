"use client";

import { useActionState, useState } from "react";
import { Bouton, Champ, ErreurFormulaire } from "@/components/ui";
import type { ResultatAction } from "@/lib/action";
import { erreursParChamp } from "@/lib/formulaire";
import type { EtudiantClasse } from "@/modules/classes";
import { modifierEtudiantAction, retirerEtudiantAction } from "../actions";
import { BoutonAction } from "../BoutonAction";
import type { ResultatMessage } from "../types";
import { InterrupteurTiersTemps } from "./InterrupteurTiersTemps";

export const GRILLE_ETUDIANTS =
  "md:grid md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_7rem_6.5rem] md:items-center md:gap-4";

const BOUTON_ICONE = "w-11 px-0";

function Icone({ trace }: { trace: "modifier" | "retirer" }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {trace === "modifier" ? (
        <path d="M4 20h4L19 9l-4-4L4 16z" />
      ) : (
        <>
          <path d="M4 7h16" />
          <path d="M6 7l1 13h10l1-13" />
          <path d="M9 7V4h6v3" />
        </>
      )}
    </svg>
  );
}

function FormulaireModification({
  etudiant,
  onTermine,
}: {
  etudiant: EtudiantClasse;
  onTermine: () => void;
}) {
  const [nom, setNom] = useState(etudiant.nom);
  const [prenom, setPrenom] = useState(etudiant.prenom);
  const [etat, action, enCours] = useActionState(
    async (precedent: ResultatAction<ResultatMessage> | null, formulaire: FormData) => {
      const resultat = await modifierEtudiantAction(precedent, formulaire);
      if (resultat.ok) onTermine();
      return resultat;
    },
    null,
  );
  const erreurs = etat && !etat.ok ? erreursParChamp(etat.erreur.details) : {};
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-3 md:flex-row md:items-start" noValidate>
        <input type="hidden" name="etudiantId" value={etudiant.id} />
        <div className="md:flex-1">
          <Champ
            id={`nom-${etudiant.id}`}
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
            id={`prenom-${etudiant.id}`}
            name="prenom"
            libelle="Prénom"
            autoComplete="off"
            maxLength={100}
            value={prenom}
            onChange={(evenement) => setPrenom(evenement.target.value)}
            erreur={erreurs.prenom}
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

/** Une ligne du tableau des étudiants (maquette « Classes ») : tiers-temps, modifier, retirer. */
export function LigneEtudiant({ etudiant }: { etudiant: EtudiantClasse }) {
  const [edition, setEdition] = useState(false);
  const nomComplet = `${etudiant.prenom} ${etudiant.nom}`;
  if (edition) {
    return (
      <li className="border-t border-ligne-douce px-4 py-3">
        <FormulaireModification etudiant={etudiant} onTermine={() => setEdition(false)} />
      </li>
    );
  }
  return (
    <li className={`flex flex-col gap-2 border-t border-ligne-douce px-4 py-3 ${GRILLE_ETUDIANTS}`}>
      <strong className="min-w-0 truncate text-[15px]">{etudiant.nom}</strong>
      <span className="min-w-0 truncate text-[15px]">{etudiant.prenom}</span>
      <span className="flex items-center gap-2">
        <span className="text-sm text-muet md:hidden">Tiers-temps</span>
        <InterrupteurTiersTemps
          etudiantId={etudiant.id}
          actif={etudiant.tiersTemps}
          nomComplet={nomComplet}
        />
      </span>
      <span className="flex gap-1.5 md:justify-end">
        <Bouton
          variante="secondaire"
          onClick={() => setEdition(true)}
          aria-label={`Modifier ${nomComplet}`}
          className={BOUTON_ICONE}
        >
          <Icone trace="modifier" />
        </Bouton>
        <BoutonAction
          action={retirerEtudiantAction}
          champs={{ etudiantId: etudiant.id }}
          etiquette={`Retirer ${nomComplet}`}
          variante="danger"
          className={BOUTON_ICONE}
        >
          <Icone trace="retirer" />
        </BoutonAction>
      </span>
    </li>
  );
}
