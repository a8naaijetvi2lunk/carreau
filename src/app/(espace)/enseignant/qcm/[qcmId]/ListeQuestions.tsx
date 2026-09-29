import { Etiquette } from "@/components/ui";
import type { QuestionEditee } from "@/modules/qcm";
import { metaQuestion, titreQuestion } from "../libelles";
import { BoutonAjouterQuestion } from "./BoutonAjouterQuestion";
import { LienSansPerte } from "./enregistrement";
import { IconeLien } from "./icones";

/** Colonne de gauche de l'éditeur (maquette « Éditeur de QCM ») : questions, liaisons, ajout. */
export function ListeQuestions({
  qcmId,
  questions,
  selection,
  modifiable,
  plein,
}: {
  qcmId: string;
  questions: QuestionEditee[];
  selection: string | null;
  modifiable: boolean;
  plein: boolean;
}) {
  return (
    <section
      aria-labelledby="titre-liste-questions"
      className="flex flex-col gap-1.5 rounded-2xl border border-ligne bg-carte p-3"
    >
      <h2 id="titre-liste-questions" className="px-1.5 pb-1 text-base font-bold">
        Questions
      </h2>
      {questions.length === 0 ? (
        <p className="px-1.5 text-[15px] text-muet">Aucune question pour l’instant.</p>
      ) : (
        <ol aria-label="Questions du QCM" className="flex flex-col gap-1">
          {questions.map((q, i) => {
            const active = q.id === selection;
            return (
              <li key={q.id} className="flex flex-col gap-1">
                <LienSansPerte
                  href={`/enseignant/qcm/${qcmId}?question=${q.id}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-13 items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 ${
                    active
                      ? "border-2 border-bleu bg-bleu-pale"
                      : "border-2 border-transparent hover:bg-papier"
                  }`}
                >
                  <span className="w-6 shrink-0 font-code text-[13px] font-semibold text-muet">{i + 1}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-bold">{titreQuestion(q.enonce)}</span>
                    <span className="text-xs text-muet">{metaQuestion(q)}</span>
                  </span>
                  {q.problemes.length > 0 ? <Etiquette>À compléter</Etiquette> : null}
                </LienSansPerte>
                {q.lieeASuivante ? (
                  <p className="flex items-center gap-1.5 pl-10 text-xs font-bold text-bleu-fonce">
                    <IconeLien />
                    Liées · restent consécutives
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      {modifiable && !plein ? <BoutonAjouterQuestion qcmId={qcmId} /> : null}
      {modifiable && plein ? (
        <p className="px-1.5 text-[13px] text-muet">Un QCM compte 100 questions au plus.</p>
      ) : null}
    </section>
  );
}
