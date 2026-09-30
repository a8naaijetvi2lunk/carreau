"use client";

import { useState } from "react";
import { useRebours } from "@/components/examen/useRebours";
import { Bouton, Etiquette } from "@/components/ui";
import type { ResultatAction } from "@/lib/action";
import { formaterHeureSecondes } from "@/lib/dates";
import { MENTION_INDICE } from "@/lib/regles-surveillance";
import { formaterChrono } from "@/lib/textes";
import type { VueSuivi } from "@/lib/vue-session";
import { prolongerSessionAction, terminerSessionAction } from "../actions";
import {
  FILTRES_SUIVI,
  filtrerLignes,
  LIBELLES_STATUT_SUIVI,
  lignesTableau,
  tonIndice,
  type FiltreSuivi,
  type LigneTableau,
  type StatutLigne,
} from "../libelles";
import { ListeDemandes } from "./ListeDemandes";
import { PanneauCode } from "./PanneauCode";

type Action = () => Promise<ResultatAction<null>>;

/** Lignes affichées avant « Afficher les N autres étudiants » (D14). */
const LIGNES_VISIBLES = 10;
const PROLONGATIONS = [5, 10, 15];

const TONS_STATUT: Record<StatutLigne, "sombre" | "bleu" | "neutre" | "alerte"> = {
  attente: "neutre",
  en_cours: "bleu",
  deconnecte: "alerte",
  terminee: "neutre",
  absent: "neutre",
};

const COULEURS_INDICE = {
  fort: { texte: "text-orange-fonce", barre: "bg-orange-fonce" },
  moyen: { texte: "text-encre", barre: "bg-ambre" },
  faible: { texte: "text-muet", barre: "bg-ligne-forte" },
};

/** Temps restant jusqu'à `finLe`, à l'heure du serveur ; lu dans une minuterie (`useRebours`). */
function CompteARebours({ finLe, decalageMs }: { finLe: string; decalageMs: number }) {
  const rebours = useRebours(finLe, decalageMs);
  return <>{rebours ? formaterChrono(rebours.secondes) : "—"}</>;
}

function TempsRestant({ suivi, decalageMs }: { suivi: VueSuivi; decalageMs: number }) {
  if (suivi.statut === "terminee") return <p className="text-lg font-bold">Examen terminé</p>;
  if (suivi.modeChrono === "par_question") return <p className="text-lg font-bold">Chrono par question</p>;
  if (suivi.modeChrono === "aucun") return <p className="text-lg font-bold">Sans limite de temps</p>;
  return (
    <p className="flex items-baseline gap-2">
      <span className="text-[15px] text-encre-2">Temps restant</span>
      <span role="timer" aria-label="Temps restant" className="font-code text-2xl font-extrabold">
        {suivi.finLe ? <CompteARebours finLe={suivi.finLe} decalageMs={decalageMs} /> : "—"}
      </span>
    </p>
  );
}

function Indice({ indice }: { indice: number | null }) {
  if (indice === null) return <span className="text-sm text-muet">—</span>;
  const couleurs = COULEURS_INDICE[tonIndice(indice)];
  return (
    <span className="flex items-center gap-2" aria-label={`Indice ${indice} sur 100`}>
      <span aria-hidden="true" className={`w-8 text-right font-code font-bold ${couleurs.texte}`}>
        {indice}
      </span>
      <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-full bg-ligne-douce">
        <span className={`block h-full rounded-full ${couleurs.barre}`} style={{ width: `${indice}%` }} />
      </span>
    </span>
  );
}

function Ligne({ ligne }: { ligne: LigneTableau }) {
  return (
    <li
      data-etudiant={ligne.nom}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-t border-ligne-douce px-5 py-3 md:grid-cols-[minmax(0,1.5fr)_8rem_6rem_8rem_minmax(0,1.5fr)]"
    >
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-[15px] font-bold">{ligne.nom}</span>
        {ligne.tiersTemps ? <Etiquette ton="bleu">Tiers-temps</Etiquette> : null}
      </span>
      <span>
        <Etiquette ton={TONS_STATUT[ligne.statut]}>{LIBELLES_STATUT_SUIVI[ligne.statut]}</Etiquette>
      </span>
      <span className="font-code text-sm text-encre-2">{ligne.progression ?? "—"}</span>
      <Indice indice={ligne.indice} />
      <span className="col-span-2 text-sm text-encre-2 md:col-span-1">{ligne.dernierFait ?? "—"}</span>
    </li>
  );
}

/**
 * Tableau de bord pendant et après l'examen (spec §7 ; D14 du plan du lot 6), sur ordinateur comme
 * sur téléphone : temps restant, « Prolonger » et « Terminer pour tous » confirmés dans la page,
 * compteurs, liste filtrable triée par indice, alertes en direct (demandes d'appareil, puis faits).
 */
export function TableauDeBord({
  sessionId,
  suivi,
  decalageMs,
  enCours,
  onAgir,
  onDecider,
}: {
  sessionId: string;
  suivi: VueSuivi;
  decalageMs: number;
  enCours: boolean;
  /** Action sur l'examen ; vrai si elle a réussi. */
  onAgir: (action: Action) => Promise<boolean>;
  onDecider: (action: Action) => void;
}) {
  const [confirmation, setConfirmation] = useState<"prolonger" | "terminer" | null>(null);
  const [filtre, setFiltre] = useState<FiltreSuivi>("tous");
  const [tout, setTout] = useState(false);
  const examenEnCours = suivi.statut === "en_cours";
  const prolongeable = examenEnCours && suivi.modeChrono === "global";
  const lignes = filtrerLignes(lignesTableau(suivi), filtre);
  const visibles = tout ? lignes : lignes.slice(0, LIGNES_VISIBLES);

  async function executer(action: Action): Promise<void> {
    if (await onAgir(action)) setConfirmation(null);
  }

  const compteurs = [
    { libelle: "Connectés", valeur: suivi.compteurs.connectes },
    { libelle: "Terminés", valeur: suivi.compteurs.termines },
    { libelle: "Absents", valeur: suivi.compteurs.absents },
    { libelle: "Alertes", valeur: suivi.compteurs.alertes },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ligne bg-carte px-5 py-4">
        <TempsRestant suivi={suivi} decalageMs={decalageMs} />
        {examenEnCours ? (
          <div className="flex flex-wrap gap-2">
            {prolongeable ? (
              <Bouton variante="secondaire" disabled={enCours} onClick={() => setConfirmation("prolonger")}>
                Prolonger
              </Bouton>
            ) : null}
            <Bouton variante="danger" disabled={enCours} onClick={() => setConfirmation("terminer")}>
              Terminer pour tous
            </Bouton>
          </div>
        ) : null}
      </div>

      {confirmation === "prolonger" && prolongeable ? (
        <div
          role="group"
          aria-label="Prolonger l’examen"
          className="flex flex-col gap-3 rounded-xl border border-bleu bg-bleu-pale px-4 py-3"
        >
          <p className="text-[15px] font-bold text-bleu-fonce">
            Ajoute du temps à tous les étudiants encore en cours. Leurs téléphones affichent la nouvelle fin.
          </p>
          <div className="flex flex-wrap gap-2">
            {PROLONGATIONS.map((minutes) => (
              <Bouton
                key={minutes}
                disabled={enCours}
                onClick={() => void executer(() => prolongerSessionAction(sessionId, minutes))}
              >
                +{minutes} min
              </Bouton>
            ))}
            <Bouton variante="secondaire" disabled={enCours} onClick={() => setConfirmation(null)}>
              Ne pas prolonger
            </Bouton>
          </div>
        </div>
      ) : null}
      {confirmation === "terminer" && examenEnCours ? (
        <div
          role="group"
          aria-label="Confirmer la fin de l’examen"
          className="flex flex-col gap-3 rounded-xl border border-orange bg-orange-pale px-4 py-3"
        >
          <p className="text-[15px] font-bold text-orange-fonce">
            L’examen se termine tout de suite pour tous : la sélection en cours de chacun est validée, les
            questions suivantes restent sans réponse. C’est définitif.
          </p>
          <div className="flex flex-wrap gap-2">
            <Bouton
              variante="danger"
              disabled={enCours}
              onClick={() => void executer(() => terminerSessionAction(sessionId))}
            >
              Oui, terminer pour tous
            </Bouton>
            <Bouton variante="secondaire" disabled={enCours} onClick={() => setConfirmation(null)}>
              Continuer l’examen
            </Bouton>
          </div>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {compteurs.map((c) => (
          <div
            key={c.libelle}
            className="flex flex-col gap-1 rounded-2xl border border-ligne bg-carte px-4 py-3"
          >
            <dt className="text-sm text-encre-2">{c.libelle}</dt>
            <dd className="font-titre text-2xl font-extrabold">{c.valeur}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <section
          aria-labelledby="suivi-etudiants"
          className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-ligne bg-carte"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
            <h2 id="suivi-etudiants" className="text-lg font-bold">
              Suivi des étudiants
            </h2>
            <div role="group" aria-label="Filtrer les étudiants" className="flex flex-wrap gap-1.5">
              {FILTRES_SUIVI.map((f) => (
                <Bouton
                  key={f.filtre}
                  variante={filtre === f.filtre ? "primaire" : "secondaire"}
                  aria-pressed={filtre === f.filtre}
                  onClick={() => {
                    setFiltre(f.filtre);
                    setTout(false);
                  }}
                >
                  {f.libelle}
                </Bouton>
              ))}
            </div>
          </div>
          <p className="border-t border-ligne-douce px-5 py-2.5 text-sm text-muet">{MENTION_INDICE}</p>
          <div
            aria-hidden="true"
            className="hidden border-t border-ligne-douce px-5 py-2 text-[13px] font-bold text-muet md:grid md:grid-cols-[minmax(0,1.5fr)_8rem_6rem_8rem_minmax(0,1.5fr)] md:gap-x-3"
          >
            <span>Étudiant</span>
            <span>Statut</span>
            <span>Progression</span>
            <span>Indice</span>
            <span>Dernier événement</span>
          </div>
          {visibles.length === 0 ? (
            <p className="border-t border-ligne-douce px-5 py-4 text-[15px] text-muet">
              Personne dans cette liste.
            </p>
          ) : (
            <ul aria-label="Étudiants">
              {visibles.map((ligne) => (
                <Ligne key={ligne.cle} ligne={ligne} />
              ))}
            </ul>
          )}
          {!tout && lignes.length > LIGNES_VISIBLES ? (
            <div className="border-t border-ligne-douce px-5 py-3">
              <Bouton variante="secondaire" onClick={() => setTout(true)}>
                Afficher les {lignes.length - LIGNES_VISIBLES} autres étudiants
              </Bouton>
            </div>
          ) : null}
        </section>

        <div className="flex min-w-0 flex-col gap-5">
          <section
            aria-labelledby="alertes-direct"
            className="flex flex-col gap-3 rounded-2xl border border-ligne bg-carte p-5"
          >
            <h2 id="alertes-direct" className="text-lg font-bold">
              Alertes en direct
            </h2>
            <ListeDemandes demandes={suivi.demandes} enCours={enCours} onDecider={onDecider} />
            {suivi.alertes.length === 0 ? (
              <p className="text-[15px] text-muet">Aucune alerte pour l’instant.</p>
            ) : (
              <ul aria-label="Alertes" className="flex flex-col gap-2">
                {suivi.alertes.map((a) => (
                  <li
                    key={a.cle}
                    className="flex flex-col gap-0.5 rounded-xl border border-ligne-douce px-4 py-2.5"
                  >
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <strong className="text-[15px]">{a.titre}</strong>
                      <span className="font-code text-sm text-muet">
                        {formaterHeureSecondes(new Date(a.le))}
                      </span>
                    </span>
                    <span className="text-sm text-encre-2">{a.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {suivi.code ? <PanneauCode code={suivi.code} reprise /> : null}
        </div>
      </div>
    </div>
  );
}
