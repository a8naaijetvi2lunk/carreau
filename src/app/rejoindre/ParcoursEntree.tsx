"use client";

import { useEffect, useRef, useState } from "react";
import { Alerte, Marque } from "@/components/ui";
import { MESSAGE_RESEAU, type ReponseApi } from "@/lib/appel-api";
import { decalageServeurMs } from "@/lib/horloge-serveur";
import { Interrogation } from "@/lib/interrogation";
import { periodeEntreeMs } from "@/lib/periode-entree";
import type { EtatEntree } from "@/lib/vue-entree";
import { choisirNom, envoyerCode, lireEtat, validerInformation } from "./api";
import { EtapeAttente } from "./EtapeAttente";
import { EtapeCode } from "./EtapeCode";
import { EtapeDemande } from "./EtapeDemande";
import { EtapeDemarrage } from "./EtapeDemarrage";
import { EtapeInformation } from "./EtapeInformation";
import { EtapeMessage } from "./EtapeMessage";
import { EtapeNom } from "./EtapeNom";

type Affichage = { etat: EtatEntree; decalageMs: number };
type PremiereEntree = ReponseApi<EtatEntree> | "reseau" | null;
type Executer = (appel: () => Promise<ReponseApi<EtatEntree>>) => Promise<void>;

/** Étapes où le téléphone est associé à un nom : la pastille « Mode examen » s'affiche. */
const ETAPES_EXAMEN = new Set<EtatEntree["etape"]>(["information", "attente", "demarrage"]);

function EtapeCourante({
  affichage,
  executer,
  perdu,
}: {
  affichage: Affichage;
  executer: Executer;
  perdu: (message: string) => void;
}) {
  const { etat } = affichage;
  switch (etat.etape) {
    case "code":
      return <EtapeCode onCode={(code) => executer(() => envoyerCode(code))} />;
    case "nom":
      return <EtapeNom etat={etat} onChoix={(id) => executer(() => choisirNom(id))} onPerdu={perdu} />;
    case "information":
      return <EtapeInformation etat={etat} onConfirmer={() => executer(validerInformation)} />;
    case "attente":
      return <EtapeAttente etat={etat} />;
    case "demarrage":
      return <EtapeDemarrage etat={etat} decalageMs={affichage.decalageMs} />;
    case "demande":
      return <EtapeDemande etat={etat} onRefaire={() => executer(() => choisirNom(etat.etudiantId))} />;
    case "remplace":
      return (
        <EtapeMessage
          session={etat.session}
          titre="Ce téléphone n’est plus associé à ton nom"
          texte="Ton enseignant a autorisé un autre téléphone pour ton examen. Si ce n’est pas toi qui l’as demandé, préviens-le tout de suite."
        />
      );
    case "fermee":
      return (
        <EtapeMessage
          session={etat.session}
          titre={etat.raison === "annulee" ? "Session annulée" : "Session terminée"}
          texte={
            etat.raison === "annulee"
              ? "Ton enseignant a annulé cette session."
              : "Cette session est terminée."
          }
        />
      );
  }
}

/**
 * Parcours de l'étudiant (spec §6.2 et §6.3, décision D19). L'état du serveur dit toujours l'étape ;
 * il est interrogé selon l'étape, jamais suspendu, et relancé au retour au premier plan.
 */
export function ParcoursEntree() {
  const [affichage, setAffichage] = useState<Affichage | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [connexionPerdue, setConnexionPerdue] = useState(false);
  const interrogation = useRef<Interrogation<EtatEntree> | null>(null);
  const decalage = useRef(0);
  // Code du QR (fragment #K7M4QP) envoyé une seule fois, même si l'effet est rejoué (mode strict).
  const premiereEntree = useRef<Promise<PremiereEntree> | null>(null);

  useEffect(() => {
    let actif = true;
    const recevoir = (etat: EtatEntree) => {
      decalage.current = decalageServeurMs(etat.serveurMaintenant, Date.now());
      setAffichage({ etat, decalageMs: decalage.current });
    };
    const suivi = new Interrogation<EtatEntree>({
      appeler: async (signal) => {
        const reponse = await lireEtat(signal);
        if (!reponse.ok) throw new Error(reponse.erreur.message);
        return reponse.donnees;
      },
      periodeMs: (etat) => periodeEntreeMs(etat, Date.now() + decalage.current),
      surResultat: (etat) => {
        setConnexionPerdue(false);
        recevoir(etat);
      },
      surEchec: (echecs) => {
        if (echecs >= 2) setConnexionPerdue(true);
      },
    });
    interrogation.current = suivi;
    if (premiereEntree.current === null) {
      const code = window.location.hash.slice(1);
      if (code === "") {
        premiereEntree.current = Promise.resolve(null);
      } else {
        // Le code quitte l'adresse aussitôt : ni rejoué, ni gardé dans l'historique (spec §6.1).
        window.history.replaceState(null, "", window.location.pathname);
        premiereEntree.current = envoyerCode(decodeURIComponent(code)).catch((): PremiereEntree => "reseau");
      }
    }
    void premiereEntree.current.then((reponse) => {
      if (!actif) return;
      if (reponse === "reseau") setErreur(MESSAGE_RESEAU);
      else if (reponse && !reponse.ok) setErreur(reponse.erreur.message);
      else if (reponse) recevoir(reponse.donnees);
      suivi.demarrer();
    });
    return () => {
      actif = false;
      suivi.arreter();
    };
  }, []);

  /** État renvoyé par une action de l'étudiant (hors rendu : `Date.now()` est permis ici). */
  function appliquer(etat: EtatEntree): void {
    decalage.current = decalageServeurMs(etat.serveurMaintenant, Date.now());
    setAffichage({ etat, decalageMs: decalage.current });
  }

  /** Action de l'étudiant ; l'interrogation reprend ensuite selon l'étape (ticket expiré : retour au code). */
  async function executer(appel: () => Promise<ReponseApi<EtatEntree>>): Promise<void> {
    setErreur(null);
    try {
      const reponse = await appel();
      if (reponse.ok) appliquer(reponse.donnees);
      else setErreur(reponse.erreur.message);
    } catch {
      setErreur(MESSAGE_RESEAU);
    }
    interrogation.current?.relancer();
  }

  function perdu(message: string): void {
    setErreur(message);
    interrogation.current?.relancer();
  }

  const modeExamen = affichage !== null && ETAPES_EXAMEN.has(affichage.etat.etape);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-5 pt-5 pb-7">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <Marque />
        {modeExamen ? (
          <span className="flex items-center gap-2 rounded-full bg-bleu-pale px-3 py-1.5 text-[13px] font-bold text-bleu-fonce">
            <span aria-hidden="true" className="size-2 rounded-full bg-bleu" />
            Mode examen
          </span>
        ) : null}
      </div>
      {connexionPerdue ? <Alerte>Connexion perdue : on réessaie automatiquement.</Alerte> : null}
      {erreur ? <Alerte ton="erreur">{erreur}</Alerte> : null}
      {affichage ? (
        <EtapeCourante affichage={affichage} executer={executer} perdu={perdu} />
      ) : (
        <p role="status" className="text-[15px] text-encre-2">
          Connexion à la session…
        </p>
      )}
    </main>
  );
}
