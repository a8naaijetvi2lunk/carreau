"use client";

import { useActionState } from "react";
import { Bouton } from "@/components/ui";
import { ChampLien } from "./ChampLien";
import type { ActionLigne } from "./types";

/** Bouton d'action d'une ligne, avec son message (erreur, succès, lien d'une invitation relancée). */
export function ActionCompte({
  action,
  champs,
  libelle,
  danger = false,
}: {
  action: ActionLigne;
  champs: Record<string, string>;
  libelle: string;
  danger?: boolean;
}) {
  const [etat, envoyer, enCours] = useActionState(action, null);
  return (
    <form action={envoyer} className="flex flex-col gap-1.5">
      {Object.entries(champs).map(([nom, valeur]) => (
        <input key={nom} type="hidden" name={nom} value={valeur} />
      ))}
      <Bouton type="submit" variante={danger ? "danger" : "secondaire"} disabled={enCours}>
        {libelle}
      </Bouton>
      {etat && !etat.ok ? (
        <p role="alert" className="text-[13px] font-bold text-orange-fonce">
          {etat.erreur.message}
        </p>
      ) : null}
      {etat?.ok ? (
        <p role="status" className="text-[13px] text-encre-2">
          {etat.donnees.message}
        </p>
      ) : null}
      {etat?.ok && etat.donnees.lien ? <ChampLien lien={etat.donnees.lien} /> : null}
    </form>
  );
}
