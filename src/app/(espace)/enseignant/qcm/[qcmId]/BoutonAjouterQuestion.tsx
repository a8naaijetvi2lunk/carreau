"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ajouterQuestionAction } from "../actions";
import { useRegistreVidanges } from "./enregistrement";

/** « + Ajouter une question » : enregistre la question en cours, ajoute à la fin, puis ouvre la nouvelle. */
export function BoutonAjouterQuestion({ qcmId }: { qcmId: string }) {
  const router = useRouter();
  const registre = useRegistreVidanges();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function ajouter(): Promise<void> {
    setErreur(null);
    setEnCours(true);
    try {
      if (registre && !(await registre.toutVidanger())) return;
      const resultat = await ajouterQuestionAction(qcmId);
      if (resultat.ok) router.push(`/enseignant/qcm/${qcmId}?question=${resultat.donnees.id}`);
      else setErreur(resultat.erreur.message);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={enCours}
        onClick={() => void ajouter()}
        className="min-h-11 rounded-[10px] border border-dashed border-muet text-sm font-bold text-bleu-fonce disabled:opacity-60"
      >
        + Ajouter une question
      </button>
      {erreur ? (
        <p role="alert" className="text-[13px] font-bold text-orange-fonce">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}
