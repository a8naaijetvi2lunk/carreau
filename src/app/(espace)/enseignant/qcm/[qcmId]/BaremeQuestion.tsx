import type { SortePoints } from "@/lib/points";
import { problemeSaisieDuree, problemeSaisiePoints } from "./brouillon";

const SORTES: readonly (readonly [SortePoints, string])[] = [
  ["bonne", "Bonne réponse"],
  ["mauvaise", "Mauvaise réponse"],
  ["vide", "Sans réponse"],
];

const CHAMP = "min-h-10 w-full rounded-lg border bg-blanc px-2.5 font-code text-[15px]";

/** Barème de la question et, en chrono par question, sa durée (maquette « Éditeur de QCM »). */
export function BaremeQuestion({
  idQuestion,
  points,
  duree,
  chronoParQuestion,
  dureeParDefautS,
  onPoints,
  onDuree,
}: {
  idQuestion: string;
  points: Record<SortePoints, string>;
  duree: string;
  chronoParQuestion: boolean;
  dureeParDefautS: number | null;
  onPoints: (sorte: SortePoints, texte: string) => void;
  onDuree: (texte: string) => void;
}) {
  const idDuree = `duree-${idQuestion}`;
  const problemeDuree = problemeSaisieDuree(duree);
  return (
    <div
      role="group"
      aria-labelledby={`bareme-${idQuestion}`}
      className="flex flex-wrap items-start gap-4 border-t border-ligne-douce pt-3.5"
    >
      <span id={`bareme-${idQuestion}`} className="w-full text-sm font-bold md:w-auto md:pt-7">
        Barème
      </span>
      {SORTES.map(([sorte, libelle]) => {
        const id = `points-${sorte}-${idQuestion}`;
        const probleme = problemeSaisiePoints(points[sorte], sorte);
        return (
          <div key={sorte} className="flex w-32 flex-col gap-1">
            <label htmlFor={id} className="text-[13px] text-muet">
              {libelle}
            </label>
            <input
              id={id}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={points[sorte]}
              onChange={(evenement) => onPoints(sorte, evenement.target.value)}
              aria-invalid={probleme ? true : undefined}
              aria-describedby={probleme ? `${id}-erreur` : undefined}
              className={`${CHAMP} ${probleme ? "border-orange" : "border-ligne"}`}
            />
            {probleme ? (
              <p id={`${id}-erreur`} className="text-xs font-bold text-orange-fonce">
                {probleme}
              </p>
            ) : null}
          </div>
        );
      })}
      {chronoParQuestion ? (
        <div className="flex w-48 flex-col gap-1">
          <label htmlFor={idDuree} className="text-[13px] text-muet">
            Durée de la question (secondes)
          </label>
          <input
            id={idDuree}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={duree}
            placeholder={dureeParDefautS === null ? "" : `${dureeParDefautS} par défaut`}
            onChange={(evenement) => onDuree(evenement.target.value)}
            aria-invalid={problemeDuree ? true : undefined}
            aria-describedby={problemeDuree ? `${idDuree}-erreur` : undefined}
            className={`${CHAMP} ${problemeDuree ? "border-orange" : "border-ligne"}`}
          />
          {problemeDuree ? (
            <p id={`${idDuree}-erreur`} className="text-xs font-bold text-orange-fonce">
              {problemeDuree}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
