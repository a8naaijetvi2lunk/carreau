"use client";

import Image from "next/image";
import { BlocCode } from "@/components/examen/QuestionEtudiant";
import { Etiquette } from "@/components/ui";
import { formaterPoints } from "@/lib/points";
import type { QuestionCorrigee, VueCorrection } from "@/lib/vue-correction";

const LETTRES = "ABCDEFGH";

const RESULTATS: Record<QuestionCorrigee["resultat"], string> = {
  juste: "Juste",
  faux: "Faux",
  vide: "Sans réponse",
};

function Question({ q }: { q: QuestionCorrigee }) {
  return (
    <section
      aria-labelledby={`correction-${q.rang}`}
      className="flex flex-col gap-3 rounded-2xl border border-ligne bg-carte p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id={`correction-${q.rang}`} className="text-[17px] font-bold">
          Question {q.rang}
        </h3>
        <span className="text-sm font-bold">
          {RESULTATS[q.resultat]} · {formaterPoints(q.points)} /{" "}
          {formaterPoints(q.pointsBonne).replace("+", "")}
        </span>
      </div>
      <p className="text-base whitespace-pre-line">{q.enonce}</p>
      {q.image ? (
        <Image
          src={q.image.url}
          alt="Image de la question"
          width={q.image.largeur}
          height={q.image.hauteur}
          className="h-auto max-h-60 w-full rounded-xl bg-blanc object-contain"
        />
      ) : null}
      {q.code ? <BlocCode code={q.code} /> : null}
      <ul aria-label={`Réponses de la question ${q.rang}`} className="flex flex-col gap-2">
        {q.propositions.map((p, i) => (
          <li
            key={i}
            className={`flex flex-col gap-2 rounded-xl p-3 ${
              p.correcte ? "border-2 border-bleu bg-bleu-pale" : "border border-ligne"
            }`}
          >
            {p.image ? (
              <Image
                src={p.image.url}
                alt=""
                width={p.image.largeur}
                height={p.image.hauteur}
                className="h-24 w-full rounded-lg bg-blanc object-contain"
              />
            ) : null}
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{LETTRES[i] ?? String(i + 1)}.</span>
              {p.texte ? <span>{p.texte}</span> : null}
              {p.correcte ? <Etiquette ton="bleu">Bonne réponse</Etiquette> : null}
              {p.choisie ? <Etiquette ton={p.correcte ? "sombre" : "alerte"}>Ta réponse</Etiquette> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Correction sur le téléphone (maquette « Fin de l’examen », D13) : chaque question, dans l'ordre vu. */
export function CorrectionEtudiant({ correction }: { correction: VueCorrection }) {
  return (
    <div className="flex flex-col gap-3" aria-label="Correction" role="region">
      <h2 className="font-titre text-2xl font-extrabold tracking-tight">Correction</h2>
      {correction.questions.map((q) => (
        <Question key={q.rang} q={q} />
      ))}
    </div>
  );
}
