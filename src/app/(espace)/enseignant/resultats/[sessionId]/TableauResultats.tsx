"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { Alerte, Bouton, Champ, Etiquette } from "@/components/ui";
import { formaterNote } from "@/lib/points";
import { MENTION_INDICE } from "@/lib/regles-surveillance";
import { nomComplet } from "@/lib/regles-session";
import type { LigneResultat, VueResultats } from "@/lib/vue-resultats";
import { erreursParChamp } from "@/lib/formulaire";
import { BarreIndice } from "../../BarreIndice";
import { creerRattrapageAction, reglerVisibiliteAction } from "../actions";
import { libelleDuree, libelleNote, libelleRattrapagePrevu } from "../libelles";

/** Lignes affichées avant « Afficher les N autres » (maquette « Résultats de session »). */
const LIGNES_VISIBLES = 10;
const CASE = "size-5 accent-bleu";

function Interrupteur({
  libelle,
  actif,
  desactive,
  onBasculer,
}: {
  libelle: string;
  actif: boolean;
  desactive: boolean;
  onBasculer: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      disabled={desactive}
      onClick={onBasculer}
      className="flex min-h-11 items-center gap-2.5 text-sm disabled:opacity-60"
    >
      <span
        aria-hidden="true"
        className={`flex h-[26px] w-11 shrink-0 rounded-full p-[3px] ${actif ? "justify-end bg-bleu" : "justify-start bg-ligne-forte"}`}
      >
        <span className="size-5 rounded-full bg-blanc" />
      </span>
      {libelle}
    </button>
  );
}

function Carte({ libelle, valeur, fort = false }: { libelle: string; valeur: string; fort?: boolean }) {
  return (
    <div
      className={`flex flex-col gap-0.5 rounded-2xl border px-5 py-3.5 ${fort ? "border-orange bg-orange-pale" : "border-ligne bg-carte"}`}
    >
      <dt className={`text-sm ${fort ? "text-orange-fonce" : "text-encre-2"}`}>{libelle}</dt>
      <dd className={`font-titre text-3xl font-extrabold tracking-tight ${fort ? "text-orange-fonce" : ""}`}>
        {valeur}
      </dd>
    </div>
  );
}

function Action({
  ligne,
  sessionId,
  onRattrapage,
}: {
  ligne: LigneResultat;
  sessionId: string;
  onRattrapage: (etudiantId: string) => void;
}) {
  if (ligne.statut === "present" && ligne.participationId) {
    return (
      <Link
        href={`/enseignant/resultats/${sessionId}/${ligne.participationId}`}
        className="text-sm font-bold text-bleu underline"
      >
        Voir le rapport
      </Link>
    );
  }
  if (ligne.statut === "en_cours") return <Etiquette>Rattrapage en cours</Etiquette>;
  if (ligne.rattrapagePrevu) {
    return (
      <Link
        href={`/enseignant/sessions/${ligne.rattrapagePrevu.sessionId}`}
        className="text-sm font-bold text-bleu underline"
      >
        {libelleRattrapagePrevu(ligne.rattrapagePrevu)}
      </Link>
    );
  }
  return (
    <Bouton
      variante="secondaire"
      className="min-h-9 px-3 text-[13px]"
      onClick={() => onRattrapage(ligne.etudiantId)}
    >
      Créer un rattrapage
    </Bouton>
  );
}

/**
 * Tableau des résultats (maquette « Résultats de session », D12) : statistiques, visibilité de la note
 * et de la correction, étudiants triés par note, rapport ou rattrapage, panneau de création d'un
 * rattrapage pour les absents cochés.
 */
export function TableauResultats({ vue }: { vue: VueResultats }) {
  const router = useRouter();
  const [tout, setTout] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [choisis, setChoisis] = useState<string[]>([]);
  const panneau = useRef<HTMLHeadingElement>(null);
  const [etatRattrapage, creer, creation] = useActionState(
    creerRattrapageAction.bind(null, vue.sessionId),
    null,
  );
  const erreursRattrapage =
    etatRattrapage && !etatRattrapage.ok ? erreursParChamp(etatRattrapage.erreur.details) : {};
  const lignes = tout ? vue.lignes : vue.lignes.slice(0, LIGNES_VISIBLES);
  const rattrapables = vue.lignes.filter((l) => l.statut === "absent" && l.rattrapagePrevu === null);
  const s = vue.statistiques;

  async function regler(noteVisible: boolean, correctionVisible: boolean): Promise<void> {
    setErreur(null);
    setEnCours(true);
    try {
      const resultat = await reglerVisibiliteAction(vue.sessionId, noteVisible, correctionVisible);
      if (resultat.ok) router.refresh();
      else setErreur(resultat.erreur.message);
    } finally {
      setEnCours(false);
    }
  }

  function preparerRattrapage(etudiantId: string): void {
    setChoisis((deja) => (deja.includes(etudiantId) ? deja : [...deja, etudiantId]));
    panneau.current?.scrollIntoView({ block: "center" });
    panneau.current?.focus();
  }

  function basculer(etudiantId: string, coche: boolean): void {
    setChoisis((deja) => (coche ? [...deja, etudiantId] : deja.filter((id) => id !== etudiantId)));
  }

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Statistiques">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Carte libelle="Moyenne" valeur={s.moyenne === null ? "—" : `${formaterNote(s.moyenne)} / 20`} />
          <Carte libelle="Médiane" valeur={s.mediane === null ? "—" : `${formaterNote(s.mediane)} / 20`} />
          <Carte libelle="Présents" valeur={`${s.presents} / ${s.effectif}`} />
          <Carte
            libelle="Indice de suspicion ≥ 60"
            valeur={String(s.indicesEleves)}
            fort={s.indicesEleves > 0}
          />
        </dl>
      </section>
      {erreur ? <Alerte ton="erreur">{erreur}</Alerte> : null}
      {vue.correctionVisible && vue.rattrapageOuvert ? (
        <Alerte>La correction sera montrée aux étudiants à la fin du rattrapage.</Alerte>
      ) : null}
      <section
        aria-labelledby="titre-etudiants"
        className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-ligne bg-carte"
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 pt-4 pb-3">
          <h2 id="titre-etudiants" className="flex-1 text-lg font-bold">
            Étudiants <span className="text-sm font-normal text-muet">· triés par note</span>
          </h2>
          <Interrupteur
            libelle="Note visible par les étudiants"
            actif={vue.noteVisible}
            desactive={enCours}
            onBasculer={() => void regler(!vue.noteVisible, vue.correctionVisible)}
          />
          <Interrupteur
            libelle="Correction visible"
            actif={vue.correctionVisible}
            desactive={enCours}
            onBasculer={() => void regler(vue.noteVisible, !vue.correctionVisible)}
          />
        </div>
        <div
          aria-hidden="true"
          className="hidden border-t border-ligne-douce bg-papier px-5 py-2 text-xs font-bold tracking-[0.06em] text-muet uppercase md:grid md:grid-cols-[minmax(0,1.6fr)_6rem_8rem_8rem_9rem_minmax(0,1.3fr)] md:gap-x-4"
        >
          <span>Étudiant</span>
          <span>Note / 20</span>
          <span>Bonnes réponses</span>
          <span>Durée</span>
          <span>Indice</span>
          <span />
        </div>
        <ul aria-label="Étudiants">
          {lignes.map((l) => {
            const nom = nomComplet(l.prenom, l.nom);
            return (
              <li
                key={l.etudiantId}
                data-etudiant={nom}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-t border-ligne-douce px-5 py-3 md:grid-cols-[minmax(0,1.6fr)_6rem_8rem_8rem_9rem_minmax(0,1.3fr)]"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-[15px] font-bold">{nom}</span>
                  {l.tiersTemps ? <Etiquette ton="bleu">Tiers-temps</Etiquette> : null}
                  {l.passage === "rattrapage" ? <Etiquette>Rattrapage</Etiquette> : null}
                </span>
                <span className="font-code text-base font-semibold">{libelleNote(l)}</span>
                <span className="font-code text-sm text-encre-2">
                  {l.bonnes === null ? "—" : `${l.bonnes} / ${vue.questions}`}
                  <span className="md:hidden"> bonnes</span>
                </span>
                <span className="text-sm text-encre-2">{libelleDuree(l.dureeS)}</span>
                <BarreIndice indice={l.indice} />
                <span className="col-span-2 flex md:col-span-1 md:justify-end">
                  <Action ligne={l} sessionId={vue.sessionId} onRattrapage={preparerRattrapage} />
                </span>
              </li>
            );
          })}
        </ul>
        {!tout && vue.lignes.length > LIGNES_VISIBLES ? (
          <button
            type="button"
            onClick={() => setTout(true)}
            className="min-h-11 border-t border-ligne-douce text-sm font-bold text-bleu"
          >
            Afficher les {vue.lignes.length - LIGNES_VISIBLES} autres
          </button>
        ) : null}
        <p className="border-t border-ligne-douce px-5 py-2.5 text-sm text-muet">{MENTION_INDICE}</p>
      </section>
      {rattrapables.length > 0 ? (
        <section
          aria-labelledby="nouveau-rattrapage"
          className="flex max-w-2xl flex-col gap-3 rounded-2xl border border-ligne bg-carte p-5"
        >
          <h2 id="nouveau-rattrapage" ref={panneau} tabIndex={-1} className="text-lg font-bold">
            Nouveau rattrapage
          </h2>
          <p className="text-[15px] text-encre-2">
            Choisis les absents : ils passeront le même examen, sur le même contenu, et leurs résultats
            rejoindront ce tableau.
          </p>
          {vue.correctionVisible ? (
            <Alerte>La correction est déjà visible : des étudiants du rattrapage ont pu la voir.</Alerte>
          ) : null}
          {etatRattrapage && !etatRattrapage.ok && !erreursRattrapage.creneauPrevu ? (
            <Alerte ton="erreur">{etatRattrapage.erreur.message}</Alerte>
          ) : null}
          <form action={creer} className="flex flex-col gap-3" noValidate>
            <fieldset className="flex flex-col gap-1">
              <legend className="text-[13px] font-bold text-encre-2">Étudiants absents</legend>
              {rattrapables.map((l) => {
                const nom = nomComplet(l.prenom, l.nom);
                return (
                  <label key={l.etudiantId} className="flex min-h-11 items-center gap-2 text-[15px]">
                    <input
                      type="checkbox"
                      name="etudiantId"
                      value={l.etudiantId}
                      checked={choisis.includes(l.etudiantId)}
                      onChange={(evenement) => basculer(l.etudiantId, evenement.target.checked)}
                      className={CASE}
                    />
                    {nom}
                  </label>
                );
              })}
            </fieldset>
            <Champ
              id="rattrapage-creneau"
              name="creneauPrevu"
              type="datetime-local"
              libelle="Créneau prévu (facultatif)"
              aide="Heure de Paris."
              erreur={erreursRattrapage.creneauPrevu}
            />
            <div>
              <Bouton type="submit" disabled={creation || choisis.length === 0}>
                Créer le rattrapage
              </Bouton>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
