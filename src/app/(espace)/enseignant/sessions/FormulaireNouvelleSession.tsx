"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alerte, Bouton, Champ, ErreurFormulaire, Selection } from "@/components/ui";
import { erreursParChamp } from "@/lib/formulaire";
import { pluriel } from "@/lib/textes";
import type { OptionsNouvelleSession } from "@/modules/sessions";
import { creerSessionAction } from "./actions";

const CASE = "size-5 accent-bleu";

/**
 * Création d'une session (spec §9.1, décision D18) : QCM prêt, classe, créneau facultatif, et la
 * visibilité de la note et de la correction reprise du QCM choisi.
 */
export function FormulaireNouvelleSession({
  options,
  qcmInitial,
}: {
  options: OptionsNouvelleSession;
  qcmInitial: string;
}) {
  const [etat, action, enCours] = useActionState(creerSessionAction, null);
  const initial = options.qcm.find((q) => q.id === qcmInitial);
  const [qcmId, setQcmId] = useState(qcmInitial);
  const [noteVisible, setNoteVisible] = useState(initial?.noteVisibleDefaut ?? true);
  const [correctionVisible, setCorrectionVisible] = useState(initial?.correctionVisibleDefaut ?? false);
  const erreurs = etat && !etat.ok ? erreursParChamp(etat.erreur.details) : {};

  function choisirQcm(id: string): void {
    setQcmId(id);
    const choisi = options.qcm.find((q) => q.id === id);
    if (choisi) {
      setNoteVisible(choisi.noteVisibleDefaut);
      setCorrectionVisible(choisi.correctionVisibleDefaut);
    }
  }

  if (!options.rgpdComplet) {
    return (
      <Alerte ton="erreur">
        Les durées de conservation et le contact des données ne sont pas encore renseignés par le super-admin
        : aucune session ne peut être créée.
      </Alerte>
    );
  }
  if (options.qcm.length === 0) {
    return (
      <p className="text-[15px] text-encre-2">
        Aucun QCM prêt.{" "}
        <Link href="/enseignant/qcm" className="font-bold text-bleu underline">
          Ouvre un QCM
        </Link>{" "}
        et marque-le comme prêt pour lancer une session.
      </p>
    );
  }
  if (options.classes.length === 0) {
    return (
      <p className="text-[15px] text-encre-2">
        Aucune classe avec des étudiants.{" "}
        <Link href="/enseignant/classes" className="font-bold text-bleu underline">
          Crée une classe
        </Link>{" "}
        et importe sa liste.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-3" noValidate>
        <Selection
          id="session-qcm"
          name="qcmId"
          libelle="QCM"
          value={qcmId}
          onChange={(evenement) => choisirQcm(evenement.target.value)}
          options={options.qcm.map((q) => ({
            valeur: q.id,
            libelle: `${q.titre} · ${pluriel(q.nombreQuestions, "question", "questions")}`,
          }))}
          erreur={erreurs.qcmId}
        />
        <Selection
          id="session-classe"
          name="classeId"
          libelle="Classe"
          defaultValue={options.classes[0]?.id}
          options={options.classes.map((c) => ({
            valeur: c.id,
            libelle: `${c.nom} · ${pluriel(c.effectif, "étudiant", "étudiants")}`,
          }))}
          erreur={erreurs.classeId}
        />
        <Champ
          id="session-creneau"
          name="creneauPrevu"
          type="datetime-local"
          libelle="Créneau prévu (facultatif)"
          aide="Heure de Paris. Il sert à classer tes sessions à venir."
          erreur={erreurs.creneauPrevu}
        />
        <fieldset className="flex flex-col gap-1">
          <legend className="text-[13px] font-bold text-encre-2">À la fin de l’examen</legend>
          <label className="flex min-h-11 items-center gap-2 text-[15px]">
            <input
              type="checkbox"
              name="noteVisible"
              checked={noteVisible}
              onChange={(evenement) => setNoteVisible(evenement.target.checked)}
              className={CASE}
            />
            Note visible par les étudiants
          </label>
          <label className="flex min-h-11 items-center gap-2 text-[15px]">
            <input
              type="checkbox"
              name="correctionVisible"
              checked={correctionVisible}
              onChange={(evenement) => setCorrectionVisible(evenement.target.checked)}
              className={CASE}
            />
            Correction visible par les étudiants
          </label>
        </fieldset>
        <Bouton type="submit" disabled={enCours} className="self-start">
          Créer la session
        </Bouton>
      </form>
      <ErreurFormulaire etat={etat} />
    </div>
  );
}
