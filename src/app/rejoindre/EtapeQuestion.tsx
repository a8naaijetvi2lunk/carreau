"use client";

import { useEffect, useRef, useState } from "react";
import { QuestionEtudiant } from "@/components/examen/QuestionEtudiant";
import { useRebours } from "@/components/examen/useRebours";
import { Bouton } from "@/components/ui";
import { formaterChrono } from "@/lib/textes";
import type { EtatEntree } from "@/lib/vue-entree";
import { enregistrerSelection } from "./api";

type EtatQuestion = Extract<EtatEntree, { etape: "question" }>;

/**
 * Question de l'examen (décision D14 du plan du lot 5). Chaque touche enregistre la sélection : la
 * dernière sélection est envoyée jusqu'à être enregistrée, et un message le dit tant qu'elle ne l'est
 * pas. « Valider et continuer » la valide sans retour possible. Le chrono est calé sur l'heure du
 * serveur ; à zéro, la dernière sélection enregistrée fait foi (spec §6.5). Remonté à chaque question
 * (clé du parent).
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
  const [nonEnregistree, setNonEnregistree] = useState(false);
  // Dernière sélection à enregistrer, boucle d'envoi en cours, composant encore affiché.
  const derniere = useRef<string[]>(etat.selection);
  const envoiEnCours = useRef(false);
  const affiche = useRef(true);
  useEffect(() => {
    affiche.current = true;
    return () => {
      affiche.current = false;
    };
  }, []);
  const rebours = useRebours(etat.echeance ?? "", decalageMs);
  const secondes = etat.echeance === null ? null : (rebours?.secondes ?? null);
  const rang = etat.question.rang;

  /**
   * Envoie la dernière sélection jusqu'à ce qu'elle soit enregistrée : réseau coupé ou limiteur,
   * nouvel essai dans 2 s avec un message ; question devenue non modifiable (409, 422), l'état est
   * redemandé. Une sélection plus récente, arrivée pendant un envoi, part au tour suivant.
   */
  async function envoyerDerniere(): Promise<void> {
    if (envoiEnCours.current) return;
    envoiEnCours.current = true;
    try {
      while (affiche.current) {
        const aEnvoyer = derniere.current;
        const reponse = await enregistrerSelection(rang, aEnvoyer).catch(() => null);
        if (!affiche.current) return;
        if (reponse !== null && !reponse.ok && reponse.statut !== 429) {
          onDesynchronise();
          return;
        }
        if (reponse === null || !reponse.ok) {
          setNonEnregistree(true);
          await new Promise((resoudre) => setTimeout(resoudre, 2_000));
          continue;
        }
        if (derniere.current === aEnvoyer) {
          setNonEnregistree(false);
          return;
        }
      }
    } finally {
      envoiEnCours.current = false;
    }
  }

  function changer(nouvelle: string[]): void {
    setSelection(nouvelle);
    derniere.current = nouvelle;
    void envoyerDerniere();
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
      {nonEnregistree ? (
        <p role="status" className="text-[15px] font-bold text-orange-fonce">
          Ta dernière sélection n’est pas encore enregistrée : on réessaie. Elle part aussi avec ta
          validation.
        </p>
      ) : null}
      {secondes === 0 ? (
        <p role="status" className="text-[15px] font-bold">
          Temps écoulé : c’est ta dernière sélection enregistrée qui est validée.
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
