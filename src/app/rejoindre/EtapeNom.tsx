"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { Alerte, Bouton } from "@/components/ui";
import { MESSAGE_RESEAU } from "@/lib/appel-api";
import { normaliserNom } from "@/lib/noms";
import { pluriel } from "@/lib/textes";
import type { EtatEntree, ResultatRecherche } from "@/lib/vue-entree";
import { chercherNom } from "./api";
import { EnTeteExamen } from "./EnTeteExamen";

type EtatNom = Extract<EtatEntree, { etape: "nom" }>;

/** Délai après la dernière frappe avant de chercher. */
const DELAI_RECHERCHE_MS = 300;

/**
 * « Qui es-tu ? » (maquette « Rejoindre », décision D8) : recherche par le début du nom ou du prénom,
 * choix dans la liste, « C’est moi, continuer ». `onPerdu` : ticket expiré ou session fermée (409).
 */
export function EtapeNom({
  etat,
  onChoix,
  onPerdu,
}: {
  etat: EtatNom;
  onChoix: (etudiantId: string) => Promise<void>;
  onPerdu: (message: string) => void;
}) {
  const [saisie, setSaisie] = useState("");
  const [resultat, setResultat] = useState<ResultatRecherche | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const perdu = useEffectEvent((message: string) => onPerdu(message));

  useEffect(() => {
    if (normaliserNom(saisie).length < 3) return;
    let annule = false;
    const minuterie = window.setTimeout(() => {
      void (async () => {
        try {
          const reponse = await chercherNom(saisie);
          if (annule) return;
          if (reponse.ok) {
            setResultat(reponse.donnees);
            setErreur(null);
          } else if (reponse.statut === 409) {
            perdu(reponse.erreur.message);
          } else {
            setErreur(reponse.erreur.message);
          }
        } catch {
          if (!annule) setErreur(MESSAGE_RESEAU);
        }
      })();
    }, DELAI_RECHERCHE_MS);
    return () => {
      annule = true;
      window.clearTimeout(minuterie);
    };
  }, [saisie]);

  function saisir(valeur: string): void {
    setSaisie(valeur);
    setChoisi(null);
    if (normaliserNom(valeur).length < 3) setResultat(null);
  }

  async function continuer(): Promise<void> {
    if (!choisi) return;
    setEnCours(true);
    try {
      await onChoix(choisi);
    } finally {
      setEnCours(false);
    }
  }

  const etudiants = resultat?.etudiants ?? [];
  return (
    <section className="flex flex-1 flex-col gap-5">
      <EnTeteExamen session={etat.session} />
      {etat.demarree ? (
        <Alerte>
          L’examen a déjà commencé : choisis ton nom seulement pour le reprendre sur ce téléphone. Ton
          enseignant devra l’autoriser.
        </Alerte>
      ) : null}
      <div className="flex flex-col gap-2">
        <h1 className="font-titre text-[34px] leading-[1.05] font-extrabold tracking-tight">Qui es-tu ?</h1>
        <p className="text-base text-encre-2">
          Tape les 3 premières lettres de ton nom ou de ton prénom, puis choisis-toi dans la liste.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="recherche-nom" className="text-sm font-bold">
          Ton nom ou ton prénom
        </label>
        <input
          id="recherche-nom"
          type="text"
          value={saisie}
          onChange={(evenement) => saisir(evenement.target.value)}
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          maxLength={100}
          className="h-14 rounded-xl border-2 border-bleu bg-carte px-4 text-xl text-encre"
        />
      </div>
      {erreur ? <Alerte ton="erreur">{erreur}</Alerte> : null}
      {resultat ? (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-[13px] text-muet">
            {etudiants.length === 0
              ? "Aucun étudiant ne correspond : vérifie l’orthographe."
              : pluriel(etudiants.length, "étudiant correspond", "étudiants correspondent")}
          </p>
          {etudiants.map((e) => {
            const actif = choisi === e.id;
            return (
              <button
                key={e.id}
                type="button"
                aria-pressed={actif}
                onClick={() => setChoisi(e.id)}
                className={`flex min-h-14 items-center justify-between gap-3 rounded-xl px-4 text-left text-[17px] ${
                  actif ? "border-2 border-bleu bg-bleu-pale" : "border border-ligne bg-carte"
                }`}
              >
                <span>
                  <strong>{e.nom.toLocaleUpperCase("fr-FR")}</strong> {e.prenom}
                </span>
                {actif ? (
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="text-bleu"
                  >
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : null}
              </button>
            );
          })}
          {resultat.autres ? (
            <p className="text-sm text-muet">D’autres étudiants correspondent : précise ta saisie.</p>
          ) : null}
          <p className="text-sm text-muet">Tu n’es pas dans la liste ? Préviens ton enseignant.</p>
        </div>
      ) : null}
      <div className="mt-auto flex flex-col gap-2.5">
        <Bouton
          disabled={!choisi || enCours}
          onClick={() => void continuer()}
          className="min-h-14 text-[17px]"
        >
          C’est moi, continuer
        </Bouton>
        <p className="text-center text-[13px] text-muet">
          Ce téléphone sera associé à ton nom jusqu’à la fin de l’examen.
        </p>
      </div>
    </section>
  );
}
