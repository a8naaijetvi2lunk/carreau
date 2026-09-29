"use client";

import { useActionState, useState } from "react";
import { Alerte, Bouton, Champ, ErreurFormulaire } from "@/components/ui";
import { erreursParChamp } from "@/lib/formulaire";
import { LIMITES_QCM, MODES_CHRONO, type ModeChrono } from "@/lib/regles-qcm";
import type { QcmEdite } from "@/modules/qcm";
import { modifierParametresAction } from "../actions";

const LIBELLES_CHRONO: Record<ModeChrono, string> = {
  aucun: "Aucun chrono",
  global: "Chrono global",
  par_question: "Chrono par question",
};

/**
 * Onglet « Paramètres » (décision D12) : titre, chrono et visibilité par défaut, enregistrés par leur
 * bouton. Les deux durées restent dans le formulaire, même masquées : changer de mode ne les efface pas.
 */
export function FormulaireParametres({
  qcm,
  lectureSeule,
}: {
  qcm: Pick<
    QcmEdite,
    | "id"
    | "titre"
    | "modeChrono"
    | "dureeGlobaleS"
    | "dureeQuestionS"
    | "noteVisibleDefaut"
    | "correctionVisibleDefaut"
  >;
  lectureSeule: boolean;
}) {
  const [etat, action, enCours] = useActionState(modifierParametresAction, null);
  const [titre, setTitre] = useState(qcm.titre);
  const [mode, setMode] = useState<ModeChrono>(qcm.modeChrono);
  const [dureeGlobale, setDureeGlobale] = useState(
    qcm.dureeGlobaleS === null ? "" : String(qcm.dureeGlobaleS / 60),
  );
  const [dureeQuestion, setDureeQuestion] = useState(
    qcm.dureeQuestionS === null ? "" : String(qcm.dureeQuestionS),
  );
  const [noteVisible, setNoteVisible] = useState(qcm.noteVisibleDefaut);
  const [correctionVisible, setCorrectionVisible] = useState(qcm.correctionVisibleDefaut);
  const erreurs = etat && !etat.ok ? erreursParChamp(etat.erreur.details) : {};
  return (
    <section
      aria-labelledby="titre-parametres"
      className="flex max-w-2xl flex-col gap-4 rounded-2xl border border-ligne bg-carte p-5"
    >
      <h2 id="titre-parametres" className="text-lg font-bold">
        Paramètres
      </h2>
      <form action={action} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="qcmId" value={qcm.id} />
        <fieldset disabled={lectureSeule} className="flex flex-col gap-4">
          <legend className="sr-only">Paramètres du QCM</legend>
          <Champ
            id="parametres-titre"
            name="titre"
            libelle="Titre du QCM"
            autoComplete="off"
            maxLength={LIMITES_QCM.titreMax}
            value={titre}
            onChange={(evenement) => setTitre(evenement.target.value)}
            erreur={erreurs.titre}
          />
          <fieldset className="flex flex-col gap-1">
            <legend className="pb-1 text-[13px] font-bold text-encre-2">Chrono</legend>
            {MODES_CHRONO.map((valeur) => (
              <label key={valeur} className="flex min-h-11 items-center gap-2.5 text-[15px]">
                <input
                  type="radio"
                  name="modeChrono"
                  value={valeur}
                  checked={mode === valeur}
                  onChange={() => setMode(valeur)}
                  className="size-5 accent-bleu"
                />
                {LIBELLES_CHRONO[valeur]}
              </label>
            ))}
          </fieldset>
          {/* Durées masquées hors de leur mode (conservées, décision D12), mais affichées dès qu'elles sont en erreur. */}
          <div className={mode === "global" || erreurs.dureeGlobaleMinutes ? "" : "hidden"}>
            <Champ
              id="parametres-duree-globale"
              name="dureeGlobaleMinutes"
              libelle="Durée de l’examen (minutes)"
              inputMode="numeric"
              autoComplete="off"
              value={dureeGlobale}
              onChange={(evenement) => setDureeGlobale(evenement.target.value)}
              erreur={erreurs.dureeGlobaleMinutes}
            />
          </div>
          <div className={mode === "par_question" || erreurs.dureeQuestionS ? "" : "hidden"}>
            <Champ
              id="parametres-duree-question"
              name="dureeQuestionS"
              libelle="Durée par question (secondes)"
              aide="Chaque question peut avoir sa propre durée, dans son barème."
              inputMode="numeric"
              autoComplete="off"
              value={dureeQuestion}
              onChange={(evenement) => setDureeQuestion(evenement.target.value)}
              erreur={erreurs.dureeQuestionS}
            />
          </div>
          <label className="flex min-h-11 items-center gap-2.5 text-[15px]">
            <input
              type="checkbox"
              name="noteVisibleDefaut"
              checked={noteVisible}
              onChange={(evenement) => setNoteVisible(evenement.target.checked)}
              className="size-5 accent-bleu"
            />
            Note visible par défaut
          </label>
          <label className="flex min-h-11 items-center gap-2.5 text-[15px]">
            <input
              type="checkbox"
              name="correctionVisibleDefaut"
              checked={correctionVisible}
              onChange={(evenement) => setCorrectionVisible(evenement.target.checked)}
              className="size-5 accent-bleu"
            />
            Correction visible par défaut
          </label>
          <p className="text-[13px] text-muet">
            Note et correction : ces réglages sont repris à la création d’une session, qui peut les changer.
          </p>
        </fieldset>
        {lectureSeule ? null : (
          <Bouton type="submit" disabled={enCours} className="self-start">
            Enregistrer les paramètres
          </Bouton>
        )}
      </form>
      {etat?.ok ? <Alerte ton="succes">{etat.donnees.message}</Alerte> : <ErreurFormulaire etat={etat} />}
    </section>
  );
}
