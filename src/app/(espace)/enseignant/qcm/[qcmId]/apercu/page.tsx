import type { Metadata } from "next";
import { QuestionEtudiant } from "@/components/examen/QuestionEtudiant";
import { Alerte, LienBouton } from "@/components/ui";
import { executerPage } from "@/lib/page";
import { formaterChrono } from "@/lib/textes";
import { exigerActeur } from "@/modules/auth";
import { apercuQcm, type ApercuQcm } from "@/modules/qcm";

export const metadata: Metadata = { title: "Aperçu étudiant" };

/** Chrono affiché à sa valeur de départ : durée de l'examen, ou de la question en chrono par question. */
function chronoAffiche(apercu: ApercuQcm, dureeQuestionS: number | null): string | null {
  if (apercu.modeChrono === "global") {
    return apercu.dureeGlobaleS === null ? null : formaterChrono(apercu.dureeGlobaleS);
  }
  if (apercu.modeChrono === "par_question")
    return dureeQuestionS === null ? null : formaterChrono(dureeQuestionS);
  return null;
}

export default async function PageApercu(props: PageProps<"/enseignant/qcm/[qcmId]/apercu">) {
  const { qcmId } = await props.params;
  const { question } = await props.searchParams;
  const apercu = await executerPage(async () => apercuQcm(await exigerActeur(), { qcmId }));
  const total = apercu.questions.length;
  const demande = typeof question === "string" ? Number.parseInt(question, 10) : 1;
  const rang = Number.isInteger(demande) ? Math.min(Math.max(demande, 1), Math.max(total, 1)) : 1;
  const courante = apercu.questions[rang - 1];
  const base = `/enseignant/qcm/${apercu.id}`;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-bold tracking-[0.06em] text-muet uppercase">Aperçu étudiant</p>
          <h1 className="font-titre text-3xl leading-tight font-extrabold tracking-tight">{apercu.titre}</h1>
        </div>
        <LienBouton href={base} variante="secondaire">
          Retour à l’éditeur
        </LienBouton>
      </div>
      <p className="max-w-2xl text-[15px] text-encre-2">
        Rien n’est enregistré ici. Pendant l’examen, l’ordre des questions et celui des réponses seront
        mélangés pour chaque étudiant.
      </p>
      {courante ? (
        <>
          <div className="mx-auto w-full max-w-[390px] rounded-[28px] border border-ligne bg-papier px-4 py-4 sm:px-5">
            <QuestionEtudiant key={rang} vue={courante.vue} chrono={chronoAffiche(apercu, courante.dureeS)} />
          </div>
          <nav aria-label="Questions de l’aperçu" className="flex flex-wrap justify-center gap-3">
            {rang > 1 ? (
              <LienBouton href={`${base}/apercu?question=${rang - 1}`} variante="secondaire">
                Question précédente
              </LienBouton>
            ) : null}
            {rang < total ? (
              <LienBouton href={`${base}/apercu?question=${rang + 1}`}>Question suivante</LienBouton>
            ) : null}
          </nav>
        </>
      ) : (
        <Alerte>Ce QCM n’a pas encore de question.</Alerte>
      )}
    </>
  );
}
