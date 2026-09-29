"use client";

import Image from "next/image";
import { useState } from "react";
import { CONSIGNES_TYPE } from "@/lib/regles-qcm";
import type { VueQuestion } from "@/lib/vue-question";

const LETTRES = "ABCDEFGH";

function IconeChrono() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2" />
      <path d="M9 2h6" />
    </svg>
  );
}

/** Bloc de code en jetons colorés par le serveur : du texte, jamais du HTML (spec §11.1). */
function BlocCode({ code }: { code: NonNullable<VueQuestion["code"]> }) {
  return (
    <div
      role="group"
      aria-label={`Code ${code.libelle}`}
      className="overflow-x-auto rounded-xl bg-code-fond p-3.5 font-code text-sm leading-[22px] text-code-texte"
    >
      {code.lignes.map((ligne, i) => (
        <div key={i} className="flex min-h-[22px]">
          <span aria-hidden="true" className="w-6 shrink-0 text-code-numero select-none">
            {i + 1}
          </span>
          <code className="whitespace-pre">
            {ligne.map((jeton, j) => (
              <span key={j} style={{ color: jeton.couleur }}>
                {jeton.texte}
              </span>
            ))}
          </code>
        </div>
      ))}
    </div>
  );
}

/**
 * Question telle que l'étudiant la voit sur son téléphone (maquettes « Question avec code » et
 * « Réponses en images », décision D18). Au lot 3, la sélection reste locale (aperçu) ; l'examen du
 * lot 5 la branchera sur le serveur. La vue ne contient jamais la bonne réponse.
 */
export function QuestionEtudiant({ vue, chrono }: { vue: VueQuestion; chrono: string | null }) {
  const [selection, setSelection] = useState<string[]>([]);
  const multiple = vue.type === "multiple";
  const enImages = vue.propositions.length > 0 && vue.propositions.every((p) => p.image !== null);

  function basculer(id: string): void {
    setSelection((actuelle) => {
      if (actuelle.includes(id)) return actuelle.filter((x) => x !== id);
      return multiple ? [...actuelle, id] : [id];
    });
  }

  return (
    <article aria-labelledby={`enonce-${vue.rang}`} className="flex flex-col gap-3.5">
      <header className="flex flex-col gap-2.5">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <p className="text-[17px] font-bold">
            Question {vue.rang} <span className="font-normal text-muet">/ {vue.total}</span>
          </p>
          {chrono ? (
            <p
              role="timer"
              className="flex items-center gap-2 rounded-full bg-encre px-3.5 py-2 font-code text-[17px] font-semibold text-carte"
            >
              <IconeChrono />
              <span>{chrono}</span>
            </p>
          ) : null}
        </div>
        <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-ligne-douce">
          <div className="h-1.5 bg-bleu" style={{ width: `${Math.round((vue.rang / vue.total) * 100)}%` }} />
        </div>
        <div className="flex items-center justify-between gap-3 text-[13px] text-muet">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-[7px] rounded-full bg-bleu" />
            Mode examen
          </span>
          <span className="font-bold text-encre">{CONSIGNES_TYPE[vue.type]}</span>
        </div>
      </header>
      <h2
        id={`enonce-${vue.rang}`}
        className="font-titre text-2xl leading-[1.15] font-extrabold tracking-tight whitespace-pre-line"
      >
        {vue.enonce}
      </h2>
      {vue.image ? (
        <Image
          src={vue.image.url}
          alt="Image de la question"
          width={vue.image.largeur}
          height={vue.image.hauteur}
          className="h-auto max-h-72 w-full rounded-xl bg-blanc object-contain"
        />
      ) : null}
      {vue.code ? <BlocCode code={vue.code} /> : null}
      <div
        role="group"
        aria-label="Réponses"
        className={enImages ? "grid grid-cols-2 gap-3" : "flex flex-col gap-2.5"}
      >
        {vue.propositions.map((p, i) => {
          const choisie = selection.includes(p.id);
          const lettre = LETTRES[i] ?? String(i + 1);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={choisie}
              onClick={() => basculer(p.id)}
              className={`flex gap-2 rounded-xl p-2.5 text-left text-[17px] ${
                enImages ? "flex-col" : "min-h-13 items-center px-3.5"
              } ${choisie ? "border-2 border-bleu bg-bleu-pale" : "border border-ligne bg-carte"}`}
            >
              {p.image ? (
                <Image
                  src={p.image.url}
                  alt=""
                  width={p.image.largeur}
                  height={p.image.hauteur}
                  className="h-26 w-full rounded-lg bg-blanc object-contain"
                />
              ) : null}
              <span className="flex items-center gap-3.5">
                <span
                  className={`flex size-[30px] shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    choisie ? "bg-bleu text-blanc" : "border-2 border-muet"
                  }`}
                >
                  {lettre}
                </span>
                {p.texte ? <span className={choisie ? "font-bold" : ""}>{p.texte}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </article>
  );
}
