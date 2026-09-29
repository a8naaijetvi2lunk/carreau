"use client";

import { useState } from "react";
import { Bouton } from "@/components/ui";
import { pluriel } from "@/lib/textes";
import type { EtatEntree } from "@/lib/vue-entree";

type EtatInformation = Extract<EtatEntree, { etape: "information" }>;

/** Ce qui est noté (maquette « Information avant l’examen », décision D11) ; le lot 6 le capturera. */
const NOTES = [
  "Sortie de l’application ou changement d’onglet, et sa durée",
  "Perte de focus : notification ouverte, écran partagé, centre de contrôle",
  "Copier-coller",
  "Temps passé sur chaque question",
  "Utilisation de ton nom sur un autre téléphone",
] as const;

/** Écran d'information (spec §6.2 étape 4, §9.4) : valeurs réelles de conservation, lecture confirmée. */
export function EtapeInformation({
  etat,
  onConfirmer,
}: {
  etat: EtatInformation;
  onConfirmer: () => Promise<void>;
}) {
  const [lu, setLu] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const { information } = etat;

  async function confirmer(): Promise<void> {
    setEnCours(true);
    try {
      await onConfirmer();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section
      aria-labelledby="titre-information"
      className="flex flex-1 flex-col gap-4 rounded-[22px] bg-carte p-5"
    >
      <h1
        id="titre-information"
        className="font-titre text-[26px] leading-[1.08] font-extrabold tracking-tight"
      >
        Ce qui est noté pendant l’examen
      </h1>
      <p className="text-[15px] text-encre-2">
        Bonjour {etat.prenom}. Pour que l’examen soit équitable pour tous, ces événements sont notés avec leur
        heure :
      </p>
      <ul className="flex flex-col gap-2.5 text-[15px]">
        {NOTES.map((note) => (
          <li key={note} className="flex gap-3">
            <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-encre" />
            {note}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1.5 rounded-xl bg-papier p-3.5">
        <p className="text-[15px] font-bold">À quoi ça sert ?</p>
        <p className="text-sm text-encre-2">
          Ces informations aident ton enseignant à vérifier que l’examen s’est déroulé dans de bonnes
          conditions. Elles ne valent pas accusation, et une coupure de réseau n’est jamais comptée.
        </p>
        <p className="text-[13px] text-muet">
          Conservation : événements {pluriel(information.conservationEvenementsJours, "jour", "jours")},
          résultats {pluriel(information.conservationResultatsJours, "jour", "jours")} · Contact :{" "}
          {information.contact}
        </p>
      </div>
      <p className="text-sm text-encre-2">
        <strong className="text-encre">Conseil :</strong> active le mode Ne pas déranger pour éviter qu’une
        notification soit enregistrée.
      </p>
      <label className="mt-auto flex min-h-11 items-center gap-3 text-[15px] font-bold">
        <input
          type="checkbox"
          checked={lu}
          onChange={(evenement) => setLu(evenement.target.checked)}
          className="size-5.5 accent-bleu"
        />
        J’ai lu et compris ces informations
      </label>
      <Bouton disabled={!lu || enCours} onClick={() => void confirmer()} className="min-h-14 text-[17px]">
        Rejoindre la salle d’attente
      </Bouton>
    </section>
  );
}
