"use client";

import { useActionState, useState } from "react";
import { Alerte, Bouton, Champ, ErreurFormulaire, Selection } from "@/components/ui";
import { erreursParChamp } from "@/lib/formulaire";
import { inviterAction } from "./actions";
import { ChampLien } from "./ChampLien";

const LIBELLES = { enseignant: "Enseignant", admin: "Admin : peut inviter des collègues" } as const;

export function FormulaireInvitation({ roles }: { roles: ("enseignant" | "admin")[] }) {
  const [etat, action, enCours] = useActionState(inviterAction, null);
  const [email, setEmail] = useState("");
  const erreurs = etat && !etat.ok ? erreursParChamp(etat.erreur.details) : {};
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-3 md:flex-row md:items-start" noValidate>
        <div className="md:flex-1">
          <Champ
            id="email-invitation"
            name="email"
            type="email"
            libelle="Email"
            autoComplete="off"
            placeholder="prenom.nom@exemple.fr"
            value={email}
            onChange={(evenement) => setEmail(evenement.target.value)}
            erreur={erreurs.email}
          />
        </div>
        <div className="md:w-72">
          <Selection
            id="role-invitation"
            name="role"
            libelle="Rôle"
            options={roles.map((role) => ({ valeur: role, libelle: LIBELLES[role] }))}
            erreur={erreurs.role}
          />
        </div>
        <Bouton type="submit" disabled={enCours} className="md:mt-[25px]">
          Envoyer l’invitation
        </Bouton>
      </form>
      <ErreurFormulaire etat={etat} />
      {etat?.ok ? (
        <div className="flex flex-col gap-3">
          {etat.donnees.messageEnvoi ? (
            <Alerte ton="info">
              Invitation créée pour {etat.donnees.email}. {etat.donnees.messageEnvoi} Transmets-lui le lien
              ci-dessous.
            </Alerte>
          ) : (
            <Alerte ton="succes">Invitation envoyée à {etat.donnees.email}.</Alerte>
          )}
          <ChampLien lien={etat.donnees.lien} />
        </div>
      ) : null}
    </div>
  );
}
