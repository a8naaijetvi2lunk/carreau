"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bouton } from "@/components/ui";
import type { ResultatAction } from "@/lib/action";
import { EnregistreurDiffere, type EtatEnregistrement } from "@/lib/enregistreur";
import { urlImage } from "@/lib/images";
import {
  CLES_LANGAGES,
  estLangageCode,
  LANGAGES_CODE,
  LIBELLES_TYPE,
  LIMITES_QCM,
  problemesQuestion,
  TYPES_QUESTION,
  type LangageCode,
} from "@/lib/regles-qcm";
import type { QuestionEditee, SaisieQuestion } from "@/modules/qcm";
import {
  deplacerQuestionAction,
  enregistrerQuestionAction,
  lierQuestionAction,
  supprimerQuestionAction,
} from "../actions";
import { BandeauLiaison, type VoisineLiaison } from "./BandeauLiaison";
import { BaremeQuestion } from "./BaremeQuestion";
import {
  brouillonInitial,
  changerType,
  cocher,
  nouvelleProposition,
  versRegle,
  versSaisie,
  type Brouillon,
} from "./brouillon";
import { ChoixImage } from "./ChoixImage";
import { useRegistreVidanges } from "./enregistrement";
import { IconeCode, IconeCroix, IconeImage } from "./icones";
import { ReponsesQuestion } from "./ReponsesQuestion";
import { StatutEnregistrement } from "./StatutEnregistrement";
import { CLASSE_BOUTON_ICONE, CLASSE_OUTIL } from "./styles";

export type ProprietesEditeur = {
  qcmId: string;
  question: QuestionEditee;
  numero: number;
  precedente: VoisineLiaison | null;
  suivante: { id: string; numero: number } | null;
  peutMonter: boolean;
  peutDescendre: boolean;
  chronoParQuestion: boolean;
  dureeParDefautS: number | null;
  lectureSeule: boolean;
};

type CodeQuestion = { langage: LangageCode; source: string };

function BlocCodeEdition({
  idQuestion,
  code,
  onChange,
}: {
  idQuestion: string;
  code: CodeQuestion;
  onChange: (code: CodeQuestion | null) => void;
}) {
  const idLangage = `langage-${idQuestion}`;
  return (
    <div className="overflow-hidden rounded-[10px] border border-code-entete">
      <div className="flex items-center justify-between gap-2 bg-code-entete px-3 py-1.5 text-xs text-code-legende">
        <div className="flex items-center gap-2">
          <label htmlFor={idLangage}>Langage du code</label>
          <select
            id={idLangage}
            value={code.langage}
            onChange={(evenement) => {
              const langage = evenement.target.value;
              if (estLangageCode(langage)) onChange({ ...code, langage });
            }}
            className="min-h-9 rounded border border-code-numero bg-code-fond px-2 text-code-texte"
          >
            {CLES_LANGAGES.map((cle) => (
              <option key={cle} value={cle}>
                {LANGAGES_CODE[cle]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          aria-label="Retirer le bloc de code"
          onClick={() => onChange(null)}
          className="inline-flex size-11 items-center justify-center text-code-texte"
        >
          <IconeCroix />
        </button>
      </div>
      <textarea
        aria-label="Code"
        value={code.source}
        spellCheck={false}
        rows={6}
        maxLength={LIMITES_QCM.codeMax}
        onChange={(evenement) => onChange({ ...code, source: evenement.target.value })}
        className="block w-full resize-y bg-code-fond px-3 py-2.5 font-code text-sm leading-[22px] text-code-texte"
      />
    </div>
  );
}

/**
 * Question choisie dans l'éditeur (maquette « Éditeur de QCM », décision D8) : chaque modification met
 * à jour l'état local et planifie l'envoi de la question entière ; les actions (déplacer, lier, supprimer)
 * vident d'abord l'envoi en attente. Monté par la page avec `key={question.id}`.
 */
export function EditeurQuestion({
  qcmId,
  question,
  numero,
  precedente,
  suivante,
  peutMonter,
  peutDescendre,
  chronoParQuestion,
  dureeParDefautS,
  lectureSeule,
}: ProprietesEditeur) {
  const router = useRouter();
  const registre = useRegistreVidanges();
  const [brouillon, setBrouillon] = useState(() => brouillonInitial(question));
  // Dernier brouillon, lu par les gestionnaires (y compris après un envoi d'image) ; jamais lu au rendu.
  const courant = useRef(brouillon);
  const compteurCles = useRef(0);
  const [etat, setEtat] = useState<EtatEnregistrement>({ etape: "repos" });
  const [enregistreur] = useState(
    () =>
      new EnregistreurDiffere<SaisieQuestion>(async (saisie) => {
        const resultat = await enregistrerQuestionAction(saisie);
        return resultat.ok
          ? { ok: true, le: resultat.donnees.modifieLe }
          : { ok: false, message: resultat.erreur.message };
      }, setEtat),
  );
  const [erreurAction, setErreurAction] = useState<string | null>(null);
  const [actionEnCours, setActionEnCours] = useState(false);
  const [confirmerSuppression, setConfirmerSuppression] = useState(false);

  useEffect(() => {
    const desinscrire = registre?.inscrire(() => enregistreur.vidanger());
    const avantDepart = (evenement: BeforeUnloadEvent) => {
      if (enregistreur.occupe) evenement.preventDefault();
    };
    window.addEventListener("beforeunload", avantDepart);
    return () => {
      window.removeEventListener("beforeunload", avantDepart);
      desinscrire?.();
      // Sortie par un lien hors de l'éditeur (navigation principale) : ce qui attend part quand même.
      if (enregistreur.occupe) void enregistreur.vidanger();
    };
  }, [registre, enregistreur]);

  function nouvelleCle(): string {
    compteurCles.current += 1;
    return `nouvelle-${compteurCles.current}`;
  }

  function modifier(miseAJour: (b: Brouillon) => Brouillon): void {
    const suivant = miseAJour(courant.current);
    courant.current = suivant;
    setBrouillon(suivant);
    enregistreur.planifier(versSaisie(question.id, suivant, question));
  }

  /** Action sur la question : enregistre d'abord ce qui attend, puis agit ; l'erreur s'affiche sous les boutons. */
  async function agir<T>(
    action: () => Promise<ResultatAction<T>>,
    ensuite?: (donnees: T) => void,
  ): Promise<void> {
    setErreurAction(null);
    setActionEnCours(true);
    try {
      if (!(await enregistreur.vidanger())) return;
      const resultat = await action();
      if (resultat.ok) ensuite?.(resultat.donnees);
      else setErreurAction(resultat.erreur.message);
    } finally {
      setActionEnCours(false);
    }
  }

  const problemes = problemesQuestion(versRegle(brouillon));
  const base = `/enseignant/qcm/${qcmId}`;

  return (
    <section
      aria-labelledby="titre-question"
      className="flex min-w-0 flex-col gap-4 rounded-2xl border border-ligne bg-carte p-5 md:p-6"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="titre-question" className="font-titre text-[22px] font-extrabold tracking-tight">
          Question {numero}
        </h2>
        <StatutEnregistrement etat={etat} />
        {lectureSeule ? null : (
          <div className="flex flex-wrap gap-2 md:ml-auto">
            <Bouton
              variante="secondaire"
              disabled={actionEnCours || !peutMonter}
              onClick={() => void agir(() => deplacerQuestionAction(question.id, "haut"))}
            >
              Monter
            </Bouton>
            <Bouton
              variante="secondaire"
              disabled={actionEnCours || !peutDescendre}
              onClick={() => void agir(() => deplacerQuestionAction(question.id, "bas"))}
            >
              Descendre
            </Bouton>
            {confirmerSuppression ? (
              <>
                <Bouton
                  variante="danger"
                  disabled={actionEnCours}
                  onClick={() =>
                    void agir(
                      () => supprimerQuestionAction(question.id),
                      ({ voisineId }) => router.replace(voisineId ? `${base}?question=${voisineId}` : base),
                    )
                  }
                >
                  Confirmer la suppression
                </Bouton>
                <Bouton variante="secondaire" onClick={() => setConfirmerSuppression(false)}>
                  Annuler
                </Bouton>
              </>
            ) : (
              <Bouton variante="danger" onClick={() => setConfirmerSuppression(true)}>
                Supprimer la question
              </Bouton>
            )}
          </div>
        )}
      </div>
      {erreurAction ? (
        <p role="alert" className="text-[13px] font-bold text-orange-fonce">
          {erreurAction}
        </p>
      ) : null}
      <BandeauLiaison
        questionId={question.id}
        precedente={precedente}
        suivante={suivante}
        lieeASuivante={question.lieeASuivante}
        lectureSeule={lectureSeule}
        desactive={actionEnCours}
        onLier={(id, liee) => void agir(() => lierQuestionAction(id, liee))}
      />
      <fieldset disabled={lectureSeule} className="flex min-w-0 flex-col gap-4">
        <legend className="sr-only">Contenu de la question {numero}</legend>
        <div
          role="group"
          aria-label="Type de question"
          className="flex flex-wrap gap-0.5 self-start rounded-[10px] bg-ligne-douce p-[3px]"
        >
          {TYPES_QUESTION.map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={brouillon.type === type}
              onClick={() => modifier((b) => changerType(b, type, nouvelleCle))}
              className={`min-h-11 rounded-lg px-3.5 text-sm ${
                brouillon.type === type ? "bg-carte font-bold" : "text-encre-2"
              }`}
            >
              {LIBELLES_TYPE[type]}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`enonce-${question.id}`} className="text-sm font-bold">
            Énoncé
          </label>
          <textarea
            id={`enonce-${question.id}`}
            rows={3}
            maxLength={LIMITES_QCM.enonceMax}
            value={brouillon.enonce}
            onChange={(evenement) => {
              const enonce = evenement.target.value;
              modifier((b) => ({ ...b, enonce }));
            }}
            className="w-full resize-y rounded-[10px] border border-ligne bg-blanc px-3 py-2.5 text-base leading-snug"
          />
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {brouillon.image ? null : (
            <ChoixImage
              etiquette="Choisir l’image de l’énoncé"
              onImage={(image) => modifier((b) => ({ ...b, image }))}
            >
              <IconeImage />
              Image
            </ChoixImage>
          )}
          {brouillon.code ? null : (
            <button
              type="button"
              onClick={() => modifier((b) => ({ ...b, code: { langage: "python", source: "" } }))}
              className={CLASSE_OUTIL}
            >
              <IconeCode />
              Bloc de code
            </button>
          )}
        </div>
        {brouillon.image ? (
          <div className="flex items-start gap-3">
            <Image
              src={urlImage(brouillon.image.id)}
              alt="Image de l’énoncé"
              width={brouillon.image.largeur}
              height={brouillon.image.hauteur}
              className="h-auto max-h-48 w-auto max-w-full rounded-lg border border-ligne bg-blanc"
            />
            <button
              type="button"
              aria-label="Retirer l’image de l’énoncé"
              onClick={() => modifier((b) => ({ ...b, image: null }))}
              className={CLASSE_BOUTON_ICONE}
            >
              <IconeCroix />
            </button>
          </div>
        ) : null}
        {brouillon.code ? (
          <BlocCodeEdition
            idQuestion={question.id}
            code={brouillon.code}
            onChange={(code) => modifier((b) => ({ ...b, code }))}
          />
        ) : null}
        <ReponsesQuestion
          idQuestion={question.id}
          type={brouillon.type}
          propositions={brouillon.propositions}
          onCocher={(cle, coche) => modifier((b) => cocher(b, cle, coche))}
          onTexte={(cle, texte) =>
            modifier((b) => ({
              ...b,
              propositions: b.propositions.map((p) => (p.cle === cle ? { ...p, texte } : p)),
            }))
          }
          onImage={(cle, image) =>
            modifier((b) => ({
              ...b,
              propositions: b.propositions.map((p) => (p.cle === cle ? { ...p, image } : p)),
            }))
          }
          onAjouter={() =>
            modifier((b) => ({ ...b, propositions: [...b.propositions, nouvelleProposition(nouvelleCle())] }))
          }
          onSupprimer={(cle) =>
            modifier((b) => ({ ...b, propositions: b.propositions.filter((p) => p.cle !== cle) }))
          }
        />
        <BaremeQuestion
          idQuestion={question.id}
          points={brouillon.points}
          duree={brouillon.duree}
          chronoParQuestion={chronoParQuestion}
          dureeParDefautS={dureeParDefautS}
          onPoints={(sorte, texte) => modifier((b) => ({ ...b, points: { ...b.points, [sorte]: texte } }))}
          onDuree={(duree) => modifier((b) => ({ ...b, duree }))}
        />
      </fieldset>
      {problemes.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-xl border border-ambre bg-carte px-4 py-3 text-sm">
          <p className="font-bold">À compléter avant de passer le QCM en « prêt » :</p>
          <ul aria-label="À compléter" className="list-disc pl-5">
            {problemes.map((probleme) => (
              <li key={probleme}>{probleme}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
