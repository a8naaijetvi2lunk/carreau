"use client";

import { useActionState, useState } from "react";
import { Bouton, Champ, ErreurFormulaire } from "@/components/ui";
import { erreursParChamp } from "@/lib/formulaire";
import { connecterAction } from "./actions";

export function FormulaireConnexion() {
  const [etat, action, enCours] = useActionState(connecterAction, null);
  // Champ contrôlé : l'adresse reste affichée après un échec.
  const [email, setEmail] = useState("");
  const erreurs = etat && !etat.ok ? erreursParChamp(etat.erreur.details) : {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <ErreurFormulaire etat={etat} />
      <Champ
        id="email"
        name="email"
        type="email"
        libelle="Adresse email"
        autoComplete="username"
        value={email}
        onChange={(evenement) => setEmail(evenement.target.value)}
        erreur={erreurs.email}
      />
      <Champ
        id="motDePasse"
        name="motDePasse"
        type="password"
        libelle="Mot de passe"
        autoComplete="current-password"
        erreur={erreurs.motDePasse}
      />
      <label className="flex min-h-11 items-center gap-3 text-[15px]">
        <input type="checkbox" name="resterConnecte" className="size-5 accent-bleu" />
        Rester connecté 30 jours sur cet appareil personnel
      </label>
      <Bouton type="submit" disabled={enCours}>
        {enCours ? "Connexion…" : "Se connecter"}
      </Bouton>
    </form>
  );
}
