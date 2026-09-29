"use client";

import { useActionState } from "react";
import { Bouton } from "@/components/ui";
import { LIBELLES_ROLE, ROLES, type Role } from "@/lib/roles";
import { changerRoleAction } from "./actions";

export function FormulaireRole({ utilisateurId, role }: { utilisateurId: string; role: Role }) {
  const [etat, action, enCours] = useActionState(changerRoleAction, null);
  const id = `role-${utilisateurId}`;
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="utilisateurId" value={utilisateurId} />
      <div className="flex gap-1.5">
        <label htmlFor={id} className="sr-only">
          Rôle du compte
        </label>
        <select
          id={id}
          name="role"
          defaultValue={role}
          className="min-h-11 rounded-[10px] border border-ligne bg-blanc px-2 text-sm"
        >
          {ROLES.map((valeur) => (
            <option key={valeur} value={valeur}>
              {LIBELLES_ROLE[valeur]}
            </option>
          ))}
        </select>
        <Bouton type="submit" variante="secondaire" disabled={enCours}>
          Changer le rôle
        </Bouton>
      </div>
      {etat && !etat.ok ? (
        <p role="alert" className="text-[13px] font-bold text-orange-fonce">
          {etat.erreur.message}
        </p>
      ) : null}
    </form>
  );
}
