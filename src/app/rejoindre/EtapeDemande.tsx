"use client";

import { useState } from "react";
import { Bouton } from "@/components/ui";
import type { EtatEntree } from "@/lib/vue-entree";
import { EnTeteExamen } from "./EnTeteExamen";

type EtatDemande = Extract<EtatEntree, { etape: "demande" }>;

const TITRE = "font-titre text-[30px] leading-[1.08] font-extrabold tracking-tight";

/** Demande d'appareil (spec §6.2, décision D10) : en attente de l'enseignant, refusée ou expirée. */
export function EtapeDemande({ etat, onRefaire }: { etat: EtatDemande; onRefaire: () => Promise<void> }) {
  const [enCours, setEnCours] = useState(false);

  async function refaire(): Promise<void> {
    setEnCours(true);
    try {
      await onRefaire();
    } finally {
      setEnCours(false);
    }
  }

  if (etat.statut === "en_attente") {
    return (
      <section className="flex flex-1 flex-col gap-5">
        <EnTeteExamen session={etat.session} />
        <h1 className={TITRE}>Demande envoyée à ton enseignant</h1>
        <p className="text-base text-encre-2">
          {etat.motif === "reprise"
            ? "Pour reprendre l’examen sur ce téléphone, ton enseignant doit l’autoriser."
            : "Ton nom est déjà utilisé sur un autre téléphone. Ton enseignant doit autoriser celui-ci avant que tu continues."}
        </p>
        <p role="status" className="text-sm text-muet">
          En attente de sa réponse…
        </p>
      </section>
    );
  }
  return (
    <section className="flex flex-1 flex-col gap-5">
      <EnTeteExamen session={etat.session} />
      <h1 className={TITRE}>{etat.statut === "refusee" ? "Demande refusée" : "Demande expirée"}</h1>
      <p className="text-base text-encre-2">
        {etat.statut === "refusee"
          ? "Ton enseignant n’a pas autorisé ce téléphone. Adresse-toi à lui."
          : "Ton enseignant n’a pas répondu à temps."}
      </p>
      <Bouton disabled={enCours} onClick={() => void refaire()} className="min-h-14 text-[17px]">
        Refaire une demande
      </Bouton>
    </section>
  );
}
