"use client";

import { useState } from "react";
import { Alerte, Bouton } from "@/components/ui";
import { MESSAGE_RESEAU } from "@/lib/appel-api";
import { formaterHeure } from "@/lib/dates";
import { formaterNote } from "@/lib/points";
import { formaterDuree } from "@/lib/textes";
import type { VueCorrection } from "@/lib/vue-correction";
import type { EtatEntree } from "@/lib/vue-entree";
import { lireCorrection } from "./api";
import { CorrectionEtudiant } from "./CorrectionEtudiant";

type EtatFin = Extract<EtatEntree, { etape: "fin" }>;

/**
 * Fin de l'examen (maquette « Fin de l’examen », D14 du plan du lot 5) ; « Voir la correction » quand elle est
 * publiée (D11 et D13 du plan du lot 7) ; la correction chargée disparaît si elle n'est plus publiée (A1 du plan
 * du lot 7).
 */
export function EtapeFin({ etat }: { etat: EtatFin }) {
  const [correction, setCorrection] = useState<VueCorrection | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function voirCorrection(): Promise<void> {
    setErreur(null);
    setChargement(true);
    try {
      const reponse = await lireCorrection();
      if (reponse.ok) setCorrection(reponse.donnees);
      else setErreur(reponse.erreur.message);
    } catch {
      setErreur(MESSAGE_RESEAU);
    } finally {
      setChargement(false);
    }
  }

  const bouton = etat.correction ? (
    correction ? (
      <Bouton variante="secondaire" onClick={() => setCorrection(null)}>
        Masquer la correction
      </Bouton>
    ) : (
      <Bouton variante="secondaire" disabled={chargement} onClick={() => void voirCorrection()}>
        Voir la correction
      </Bouton>
    )
  ) : null;

  return (
    <section data-etat="fin" className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col items-center gap-3 pt-3 text-center">
        <h1 className="font-titre text-[32px] leading-[1.05] font-extrabold tracking-tight">
          Examen terminé
        </h1>
        <p className="text-base text-encre-2">
          Tes réponses ont été enregistrées à {formaterHeure(new Date(etat.enregistreesLe))}.
        </p>
      </div>
      <dl className="flex flex-col rounded-2xl border border-ligne bg-carte">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <dt className="text-encre-2">Questions répondues</dt>
          <dd className="font-bold">
            {etat.repondues} / {etat.total}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-ligne-douce px-5 py-4">
          <dt className="text-encre-2">Durée</dt>
          <dd className="font-bold">{formaterDuree(etat.dureeS)}</dd>
        </div>
      </dl>
      {etat.note === null ? (
        <p className="text-center text-base text-encre-2">Ta note te sera communiquée par ton enseignant.</p>
      ) : (
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-bleu-pale px-5 py-5 text-center">
          <p className="text-sm font-bold tracking-[0.06em] text-bleu-fonce uppercase">Ta note</p>
          <p className="font-titre text-5xl font-extrabold">{formaterNote(etat.note)} / 20</p>
        </div>
      )}
      {bouton}
      {erreur ? <Alerte ton="erreur">{erreur}</Alerte> : null}
      {etat.correction && correction ? <CorrectionEtudiant correction={correction} /> : null}
      <p className="text-center text-[15px] text-muet">Tu peux fermer cette page.</p>
    </section>
  );
}
