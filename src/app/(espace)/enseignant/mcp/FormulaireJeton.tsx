"use client";

import { useActionState, useState } from "react";
import { Alerte, Bouton, Champ, ErreurFormulaire } from "@/components/ui";
import type { ResultatAction } from "@/lib/action";
import { erreursParChamp } from "@/lib/formulaire";
import { LIBELLES_PORTEE_MCP, LIMITES_JETONS_MCP } from "@/lib/regles-mcp";
import type { JetonMcpCree } from "@/modules/mcp";
import { creerJetonAction } from "./actions";
import { ChampCopie } from "./ChampCopie";

const CHOIX = [
  { portee: "ecriture", aide: "prépare et modifie tes brouillons" },
  { portee: "lecture", aide: "lit tes brouillons et le nom de tes classes, sans rien changer" },
] as const;

/** Création d'un jeton (maquette « Prof-MCP ») : le jeton créé s'affiche une seule fois, à copier. */
export function FormulaireJeton() {
  const [nom, setNom] = useState("");
  const [etat, action, enCours] = useActionState(
    async (precedent: ResultatAction<JetonMcpCree> | null, formulaire: FormData) => {
      const resultat = await creerJetonAction(precedent, formulaire);
      if (resultat.ok) setNom("");
      return resultat;
    },
    null,
  );
  const erreurs = etat && !etat.ok ? erreursParChamp(etat.erreur.details) : {};
  return (
    <div className="flex flex-col gap-4">
      {etat?.ok ? (
        <div className="flex flex-col gap-3">
          <Alerte ton="succes">
            Jeton « {etat.donnees.nom} » créé. Copie-le maintenant : il ne sera plus jamais affiché.
          </Alerte>
          <ChampCopie
            id="jeton-cree"
            libelle="Nouveau jeton"
            valeur={etat.donnees.jeton}
            libelleBouton="Copier le nouveau jeton"
          />
        </div>
      ) : null}
      <form action={action} className="flex flex-col gap-3" noValidate>
        <Champ
          id="nom-jeton"
          name="nom"
          libelle="Nom du nouveau jeton"
          placeholder="Ex. : tablette"
          autoComplete="off"
          maxLength={LIMITES_JETONS_MCP.nomMax}
          value={nom}
          onChange={(evenement) => setNom(evenement.target.value)}
          erreur={erreurs.nom}
        />
        <fieldset className="flex flex-col gap-1">
          <legend className="pb-1 text-[13px] font-bold text-encre-2">Portée</legend>
          {CHOIX.map((choix) => (
            <label key={choix.portee} className="flex min-h-11 items-center gap-2 text-[15px]">
              <input
                type="radio"
                name="portee"
                value={choix.portee}
                defaultChecked={choix.portee === "ecriture"}
                className="size-4 accent-bleu"
              />
              <span>
                <strong>{LIBELLES_PORTEE_MCP[choix.portee]}</strong>
                <span className="text-muet"> : {choix.aide}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <Bouton type="submit" disabled={enCours} className="self-start">
          Générer un jeton
        </Bouton>
      </form>
      <ErreurFormulaire etat={etat} />
    </div>
  );
}
