"use client";

import { useRef, useState } from "react";
import { QuestionEtudiant } from "@/components/examen/QuestionEtudiant";
import { useRebours } from "@/components/examen/useRebours";
import { Bouton } from "@/components/ui";
import { formaterChrono } from "@/lib/textes";
import type { EtatEntree } from "@/lib/vue-entree";
import { enregistrerSelection } from "./api";

type EtatQuestion = Extract<EtatEntree, { etape: "question" }>;

/**
 * Question de l'examen (décision D14 du plan du lot 5). Chaque touche enregistre la sélection : les
 * envois partent en file, le dernier envoyé est donc le dernier enregistré. « Valider et continuer »
 * la valide sans retour possible. Le chrono est calé sur l'heure du serveur ; à zéro, la dernière
 * sélection enregistrée fait foi. Remonté à chaque question (clé du parent).
 */
export function EtapeQuestion({
  etat,
  decalageMs,
  onValider,
  onDesynchronise,
}: {
  etat: EtatQuestion;
  decalageMs: number;
  onValider: (rang: number, selection: string[]) => Promise<void>;
  /** La question n'est plus modifiable côté serveur : l'état est redemandé. */
  onDesynchronise: () => void;
}) {
  const [selection, setSelection] = useState<string[]>(etat.selection);
  const [envoi, setEnvoi] = useState(false);
  const file = useRef<Promise<void>>(Promise.resolve());
  const rebours = useRebours(etat.echeance ?? "", decalageMs);
  const secondes = etat.echeance === null ? null : (rebours?.secondes ?? null);
  const rang = etat.question.rang;

  function changer(nouvelle: string[]): void {
    setSelection(nouvelle);
    file.current = file.current
      .then(async () => {
        const reponse = await enregistrerSelection(rang, nouvelle);
        if (!reponse.ok) onDesynchronise();
      })
      // Réseau coupé : la sélection partira avec la validation, et l'interrogation signale la coupure.
      .catch(() => undefined);
  }

  async function valider(): Promise<void> {
    setEnvoi(true);
    try {
      await onValider(rang, selection);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <section data-etat="question" data-rang={rang} className="flex flex-col gap-5">
      <QuestionEtudiant
        vue={etat.question}
        chrono={secondes === null ? null : formaterChrono(secondes)}
        selection={selection}
        onSelection={changer}
        desactivee={envoi}
      />
      {secondes === 0 ? (
        <p role="status" className="text-[15px] font-bold">
          Temps écoulé : ta dernière sélection est enregistrée.
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Bouton disabled={envoi} className="min-h-14 text-lg" onClick={() => void valider()}>
          {selection.length === 0 ? "Valider sans réponse" : "Valider et continuer"}
        </Bouton>
        <p className="text-center text-[13px] text-muet">Aucun retour possible après validation.</p>
      </div>
    </section>
  );
}
