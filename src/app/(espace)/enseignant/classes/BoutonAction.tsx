"use client";

import { useActionState, type ReactNode } from "react";
import { Bouton } from "@/components/ui";
import type { ActionMessage } from "./types";

/** Bouton qui envoie une action d'une ligne (champs cachés), avec son message d'erreur. */
export function BoutonAction({
  action,
  champs,
  children,
  etiquette,
  variante = "secondaire",
  className = "",
}: {
  action: ActionMessage;
  champs: Record<string, string>;
  children: ReactNode;
  /** Nom accessible, pour un bouton à icône. */
  etiquette?: string;
  variante?: "primaire" | "secondaire" | "danger";
  className?: string;
}) {
  const [etat, envoyer, enCours] = useActionState(action, null);
  return (
    <form action={envoyer} className="flex flex-col gap-1.5">
      {Object.entries(champs).map(([nom, valeur]) => (
        <input key={nom} type="hidden" name={nom} value={valeur} />
      ))}
      <Bouton
        type="submit"
        variante={variante}
        disabled={enCours}
        aria-label={etiquette}
        className={className}
      >
        {children}
      </Bouton>
      {etat && !etat.ok ? (
        <p role="alert" className="text-[13px] font-bold text-orange-fonce">
          {etat.erreur.message}
        </p>
      ) : null}
    </form>
  );
}
