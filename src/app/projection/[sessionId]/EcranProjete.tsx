"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRebours } from "@/components/examen/useRebours";
import { Alerte, Bouton, Marque } from "@/components/ui";
import { demarrerSessionAction } from "@/app/(espace)/enseignant/sessions/actions";
import { appelerApi } from "@/lib/appel-api";
import { decalageServeurMs } from "@/lib/horloge-serveur";
import { Interrogation } from "@/lib/interrogation";
import { pluriel } from "@/lib/textes";
import type { VueProjection } from "@/lib/vue-session";

/** Période de l'écran projeté (spec §7). */
const PERIODE_PROJECTION_MS = 2_000;

export type EnTeteProjection = { titre: string; sousTitre: string };

/** Départ commun, en grand : compte à rebours puis « L’examen a commencé ». */
function Depart({
  demarreLe,
  decalageMs,
  connectes,
}: {
  demarreLe: string;
  decalageMs: number;
  connectes: number;
}) {
  const rebours = useRebours(demarreLe, decalageMs);
  if (!rebours) return null;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      {rebours.secondes > 0 ? (
        <>
          <h2 className="font-titre text-4xl font-extrabold">L’examen commence dans</h2>
          <p role="timer" className="font-titre text-[160px] leading-none font-extrabold">
            {rebours.secondes}
          </p>
        </>
      ) : (
        <>
          <h2 className="font-titre text-6xl font-extrabold">L’examen a commencé</h2>
          <p className="text-2xl text-encre-2">
            {pluriel(connectes, "étudiant compose", "étudiants composent")}. Bon courage à tous.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Écran projeté (maquette « Écran projeté », décision D18) : QR code et code tournant, connectés et
 * absents, « Démarrer l’examen ». Après le départ, le code n'est plus projeté (amendement A1).
 * Interrogé toutes les 2 s, suspendu quand l'onglet est masqué.
 */
export function EcranProjete({
  sessionId,
  entete,
  vueInitiale,
}: {
  sessionId: string;
  entete: EnTeteProjection;
  vueInitiale: VueProjection;
}) {
  const [vue, setVue] = useState(vueInitiale);
  const [decalageMs, setDecalageMs] = useState(0);
  const [confirmer, setConfirmer] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [connexionPerdue, setConnexionPerdue] = useState(false);
  const interrogation = useRef<Interrogation<VueProjection> | null>(null);

  useEffect(() => {
    const projection = new Interrogation<VueProjection>({
      appeler: async (signal) => {
        const reponse = await appelerApi<VueProjection>(
          `/api/enseignant/sessions/${sessionId}/projection`,
          {},
          signal,
        );
        if (!reponse.ok) throw new Error(reponse.erreur.message);
        return reponse.donnees;
      },
      periodeMs: () => PERIODE_PROJECTION_MS,
      surResultat: (nouvelle) => {
        setConnexionPerdue(false);
        setDecalageMs(decalageServeurMs(nouvelle.serveurMaintenant, Date.now()));
        setVue(nouvelle);
      },
      surEchec: (echecs) => {
        if (echecs >= 2) setConnexionPerdue(true);
      },
      suspendreSiMasque: true,
    });
    interrogation.current = projection;
    projection.demarrer();
    return () => projection.arreter();
  }, [sessionId]);

  async function demarrer(): Promise<void> {
    setErreur(null);
    setEnCours(true);
    try {
      const resultat = await demarrerSessionAction(sessionId);
      if (resultat.ok) setConfirmer(false);
      else setErreur(resultat.erreur.message);
      interrogation.current?.relancer();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1440px] flex-col gap-8 px-6 py-8 lg:px-16 lg:py-11">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <Marque />
          <h1 className="font-titre text-3xl leading-tight font-extrabold tracking-tight lg:text-[44px]">
            {entete.titre}
          </h1>
          <p className="text-lg text-encre-2 lg:text-xl">{entete.sousTitre}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {vue.statut === "attente" ? (
            <p className="flex items-center gap-2.5 rounded-full bg-bleu-pale px-4 py-2 text-lg font-bold text-bleu-fonce">
              <span aria-hidden="true" className="size-2.5 rounded-full bg-bleu" />
              Salle d’attente ouverte
            </p>
          ) : null}
          <Link href={`/enseignant/sessions/${sessionId}`} className="text-sm font-bold text-bleu underline">
            Page de la session
          </Link>
        </div>
      </header>

      {connexionPerdue ? <Alerte>Connexion perdue : on réessaie automatiquement.</Alerte> : null}
      {erreur ? <Alerte ton="erreur">{erreur}</Alerte> : null}

      {vue.statut === "annulee" || vue.statut === "terminee" ? (
        <h2 className="font-titre text-5xl font-extrabold">
          {vue.statut === "annulee" ? "Session annulée" : "Session terminée"}
        </h2>
      ) : vue.statut === "en_cours" && vue.demarreLe ? (
        <Depart demarreLe={vue.demarreLe} decalageMs={decalageMs} connectes={vue.connectes.length} />
      ) : (
        <div className="grid min-h-0 flex-1 gap-10 lg:grid-cols-[520px_minmax(0,1fr)] lg:gap-16">
          {vue.code ? (
            <section
              aria-label="Rejoindre la session"
              className="flex flex-col items-center gap-4 rounded-3xl border border-ligne bg-carte px-8 py-7"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- QR code en URI data:, rien à optimiser */}
              <img
                src={vue.code.qrCode}
                alt="QR code de la session"
                width={300}
                height={300}
                className="rounded-xl bg-blanc"
              />
              <p className="text-2xl font-bold">Scanne pour rejoindre</p>
              <p className="text-center text-[15px] text-muet">ou va sur {vue.code.adresse} et saisis</p>
              <output
                aria-label="Code de la session"
                className="font-code text-6xl leading-none font-semibold tracking-[0.08em]"
              >
                {vue.code.code}
              </output>
              <div className="flex w-72 flex-col items-center gap-2">
                <p className="text-[15px] text-muet">Nouveau code dans {vue.code.secondesRestantes} s</p>
                <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-ligne-douce">
                  <div
                    className="h-1.5 bg-bleu"
                    style={{ width: `${Math.round((vue.code.secondesRestantes / 30) * 100)}%` }}
                  />
                </div>
              </div>
            </section>
          ) : null}
          <section aria-label="Étudiants connectés" className="flex min-w-0 flex-col gap-5">
            <h2 className="flex flex-wrap items-baseline gap-4">
              <span className="font-titre text-7xl leading-none font-extrabold lg:text-[104px]">
                {vue.connectes.length} / {vue.effectif}
              </span>
              <span className="text-2xl text-encre-2">connectés</span>
            </h2>
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
              {vue.connectes.map((nom, index) => (
                <li
                  key={`${nom}-${index}`}
                  className="flex min-h-11 items-center gap-2.5 rounded-[10px] border border-ligne bg-carte px-3.5 text-lg font-bold"
                >
                  <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-bleu" />
                  <span className="truncate">{nom}</span>
                </li>
              ))}
            </ul>
            {vue.absents.length > 0 ? (
              <p className="text-lg text-encre-2">
                <strong className="text-encre">Pas encore connectés :</strong> {vue.absents.join(", ")}
              </p>
            ) : null}
            <div className="mt-auto flex flex-wrap items-center gap-6">
              {confirmer ? (
                <div role="group" aria-label="Confirmer le démarrage" className="flex flex-wrap gap-3">
                  <Bouton
                    disabled={enCours}
                    className="min-h-16 px-8 text-xl"
                    onClick={() => void demarrer()}
                  >
                    Démarrer maintenant
                  </Bouton>
                  <Bouton
                    variante="secondaire"
                    disabled={enCours}
                    className="min-h-16 px-8 text-xl"
                    onClick={() => setConfirmer(false)}
                  >
                    Pas encore
                  </Bouton>
                </div>
              ) : (
                <Bouton className="min-h-16 px-9 text-xl" onClick={() => setConfirmer(true)}>
                  Démarrer l’examen
                </Bouton>
              )}
              <p className="max-w-sm text-lg text-encre-2">
                Tous les connectés commenceront en même temps. Ensuite, plus personne ne pourra rejoindre.
              </p>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
