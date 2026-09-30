"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useRebours } from "@/components/examen/useRebours";
import { Alerte, Bouton, classesBouton, Etiquette } from "@/components/ui";
import type { ResultatAction } from "@/lib/action";
import { appelerApi } from "@/lib/appel-api";
import { formaterHeure } from "@/lib/dates";
import { decalageServeurMs } from "@/lib/horloge-serveur";
import { Interrogation } from "@/lib/interrogation";
import { LIBELLES_STATUT_SESSION } from "@/lib/regles-session";
import type { VueSuivi } from "@/lib/vue-session";
import { annulerSessionAction, demarrerSessionAction, retirerParticipantAction } from "../actions";
import { TONS_STATUT_SESSION } from "../libelles";
import { ListeDemandes } from "./ListeDemandes";
import { ListesSalle } from "./ListesSalle";
import { PanneauCode } from "./PanneauCode";
import { TableauDeBord } from "./TableauDeBord";

/** Période du suivi de la page de pilotage (spec §7). */
const PERIODE_SUIVI_MS = 3_000;

/** Départ commun : compte à rebours, puis heure du départ. */
function Depart({ demarreLe, decalageMs }: { demarreLe: string; decalageMs: number }) {
  const rebours = useRebours(demarreLe, decalageMs);
  if (!rebours) return null;
  return (
    <Alerte ton="succes">
      {rebours.secondes > 0
        ? `L’examen commence dans ${rebours.secondes} s sur tous les téléphones.`
        : `Examen démarré à ${formaterHeure(new Date(demarreLe))}.`}
    </Alerte>
  );
}

/**
 * Pilotage d'une session (décision D18) : statut, écran projeté, démarrage et annulation confirmés dans
 * la page, code, demandes d'appareil, salle d'attente ; pendant et après l'examen, le tableau de bord
 * (D14 du plan du lot 6). Le suivi est interrogé toutes les 3 s, et suspendu quand l'onglet est masqué.
 */
export function PilotageSession({ sessionId, suiviInitial }: { sessionId: string; suiviInitial: VueSuivi }) {
  const router = useRouter();
  const [suivi, setSuivi] = useState(suiviInitial);
  const [decalageMs, setDecalageMs] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurSalle, setErreurSalle] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [confirmation, setConfirmation] = useState<"demarrer" | "annuler" | null>(null);
  const [connexionPerdue, setConnexionPerdue] = useState(false);
  const interrogation = useRef<Interrogation<VueSuivi> | null>(null);

  useEffect(() => {
    const suiviPeriodique = new Interrogation<VueSuivi>({
      appeler: async (signal) => {
        const reponse = await appelerApi<VueSuivi>(`/api/enseignant/sessions/${sessionId}/suivi`, {}, signal);
        if (!reponse.ok) throw new Error(reponse.erreur.message);
        return reponse.donnees;
      },
      periodeMs: () => PERIODE_SUIVI_MS,
      surResultat: (vue) => {
        setConnexionPerdue(false);
        setDecalageMs(decalageServeurMs(vue.serveurMaintenant, Date.now()));
        setSuivi(vue);
      },
      surEchec: (echecs) => {
        if (echecs >= 2) setConnexionPerdue(true);
      },
      suspendreSiMasque: true,
    });
    interrogation.current = suiviPeriodique;
    suiviPeriodique.demarrer();
    return () => suiviPeriodique.arreter();
  }, [sessionId]);

  /**
   * Action de l'enseignant ; le suivi est relancé, et l'en-tête rafraîchi si elle a réussi. `portee`
   * distingue les actions de salle d'attente (démarrer, annuler, retirer) des décisions sur une
   * demande et des actions sur l'examen (prolonger, terminer), pour qu'une erreur de salle ne reste
   * pas affichée une fois l'examen commencé ; une erreur « examen » s'affiche comme celle d'une
   * demande. Renvoie vrai si l'action a réussi.
   */
  async function agir(
    action: () => Promise<ResultatAction<null>>,
    portee: "salle" | "demande" | "examen",
  ): Promise<boolean> {
    setErreur(null);
    setErreurSalle(null);
    setEnCours(true);
    try {
      const resultat = await action();
      if (resultat.ok) {
        setConfirmation(null);
        router.refresh();
      } else if (portee === "salle") {
        setErreurSalle(resultat.erreur.message);
      } else {
        setErreur(resultat.erreur.message);
      }
      interrogation.current?.relancer();
      return resultat.ok;
    } finally {
      setEnCours(false);
    }
  }

  const enAttente = suivi.statut === "attente";
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Etiquette ton={TONS_STATUT_SESSION[suivi.statut]}>{LIBELLES_STATUT_SESSION[suivi.statut]}</Etiquette>
        <Link
          href={`/projection/${sessionId}`}
          target="_blank"
          rel="noopener"
          className={classesBouton("secondaire")}
        >
          Écran projeté
        </Link>
        {enAttente ? (
          <>
            <Bouton disabled={enCours} onClick={() => setConfirmation("demarrer")}>
              Démarrer l’examen
            </Bouton>
            <Bouton variante="danger" disabled={enCours} onClick={() => setConfirmation("annuler")}>
              Annuler la session
            </Bouton>
          </>
        ) : null}
      </div>
      {confirmation === "demarrer" && enAttente ? (
        <div
          role="group"
          aria-label="Confirmer le démarrage"
          className="flex flex-col gap-3 rounded-xl border border-bleu bg-bleu-pale px-4 py-3"
        >
          <p className="text-[15px] font-bold text-bleu-fonce">
            Tous les connectés commenceront dans 5 secondes, en même temps. Ensuite, plus personne ne pourra
            rejoindre la session.
          </p>
          <div className="flex flex-wrap gap-2">
            <Bouton
              disabled={enCours}
              onClick={() => void agir(() => demarrerSessionAction(sessionId), "salle")}
            >
              Démarrer maintenant
            </Bouton>
            <Bouton variante="secondaire" disabled={enCours} onClick={() => setConfirmation(null)}>
              Pas encore
            </Bouton>
          </div>
        </div>
      ) : null}
      {confirmation === "annuler" && enAttente ? (
        <div
          role="group"
          aria-label="Confirmer l’annulation"
          className="flex flex-col gap-3 rounded-xl border border-orange bg-orange-pale px-4 py-3"
        >
          <p className="text-[15px] font-bold text-orange-fonce">
            La session sera annulée et les étudiants déjà connectés en sortiront. C’est définitif.
          </p>
          <div className="flex flex-wrap gap-2">
            <Bouton
              variante="danger"
              disabled={enCours}
              onClick={() => void agir(() => annulerSessionAction(sessionId), "salle")}
            >
              Oui, annuler la session
            </Bouton>
            <Bouton variante="secondaire" disabled={enCours} onClick={() => setConfirmation(null)}>
              Garder la session
            </Bouton>
          </div>
        </div>
      ) : null}
      {connexionPerdue ? <Alerte>Connexion perdue : on réessaie automatiquement.</Alerte> : null}
      {erreur ? <Alerte ton="erreur">{erreur}</Alerte> : null}
      {enAttente && erreurSalle ? <Alerte ton="erreur">{erreurSalle}</Alerte> : null}
      {suivi.statut === "en_cours" && suivi.demarreLe ? (
        <Depart demarreLe={suivi.demarreLe} decalageMs={decalageMs} />
      ) : null}
      {suivi.statut === "en_cours" || suivi.statut === "terminee" ? (
        <TableauDeBord
          sessionId={sessionId}
          suivi={suivi}
          decalageMs={decalageMs}
          enCours={enCours}
          onAgir={(action) => agir(action, "examen")}
          onDecider={(action) => void agir(action, "demande")}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
          {suivi.code ? <PanneauCode code={suivi.code} reprise={false} /> : null}
          <div className="flex min-w-0 flex-col gap-5">
            <ListeDemandes
              demandes={suivi.demandes}
              enCours={enCours}
              onDecider={(action) => void agir(action, "demande")}
            />
            <ListesSalle
              suivi={suivi}
              enCours={enCours}
              onRetirer={(participationId) =>
                void agir(() => retirerParticipantAction(participationId), "salle")
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
