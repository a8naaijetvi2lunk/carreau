import Image from "next/image";
import { urlImage, type ImageVue } from "@/lib/images";
import { LIMITES_QCM, type TypeQuestion } from "@/lib/regles-qcm";
import type { PropositionBrouillon } from "./brouillon";
import { ChoixImage } from "./ChoixImage";
import { IconeCroix, IconeImage } from "./icones";
import { CLASSE_BOUTON_ICONE } from "./styles";

/** Réponses de la question (maquette « Éditeur de QCM ») : bonne réponse, texte, image, suppression. */
export function ReponsesQuestion({
  idQuestion,
  type,
  propositions,
  onCocher,
  onTexte,
  onImage,
  onAjouter,
  onSupprimer,
}: {
  idQuestion: string;
  type: TypeQuestion;
  propositions: PropositionBrouillon[];
  onCocher: (cle: string, coche: boolean) => void;
  onTexte: (cle: string, texte: string) => void;
  onImage: (cle: string, image: ImageVue | null) => void;
  onAjouter: () => void;
  onSupprimer: (cle: string) => void;
}) {
  const multiple = type === "multiple";
  const vraiFaux = type === "vrai_faux";
  return (
    <div role="group" aria-labelledby={`reponses-${idQuestion}`} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span id={`reponses-${idQuestion}`} className="text-sm font-bold">
          Réponses
        </span>
        <span className="text-[13px] text-muet">
          {multiple ? "Coche les bonnes réponses" : "Coche la bonne réponse"} · l’ordre est mélangé pour
          chaque étudiant
        </span>
      </div>
      {propositions.map((p, i) => (
        <div key={p.cle} className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <input
              type={multiple ? "checkbox" : "radio"}
              name={`bonne-${idQuestion}`}
              checked={p.correcte}
              onChange={(evenement) => onCocher(p.cle, evenement.target.checked)}
              aria-label={`Bonne réponse : réponse ${i + 1}`}
              className="size-5 shrink-0 accent-bleu"
            />
            <input
              type="text"
              value={p.texte}
              maxLength={LIMITES_QCM.reponseMax}
              onChange={(evenement) => onTexte(p.cle, evenement.target.value)}
              aria-label={`Réponse ${i + 1}`}
              className={`min-h-11 min-w-0 flex-1 rounded-[10px] bg-blanc px-3 text-[15px] ${
                p.correcte ? "border-2 border-bleu" : "border border-ligne"
              }`}
            />
          </div>
          <div className="flex items-center gap-2 pl-7 md:pl-0">
            {p.image ? (
              <>
                <Image
                  src={urlImage(p.image.id)}
                  alt={`Image de la réponse ${i + 1}`}
                  width={p.image.largeur}
                  height={p.image.hauteur}
                  className="h-11 w-auto rounded border border-ligne bg-blanc"
                />
                <button
                  type="button"
                  aria-label={`Retirer l’image de la réponse ${i + 1}`}
                  onClick={() => onImage(p.cle, null)}
                  className={CLASSE_BOUTON_ICONE}
                >
                  <IconeCroix />
                </button>
              </>
            ) : (
              <ChoixImage
                etiquette={`Choisir l’image de la réponse ${i + 1}`}
                onImage={(image) => onImage(p.cle, image)}
                compact
              >
                <IconeImage />
              </ChoixImage>
            )}
            {vraiFaux ? null : (
              <button
                type="button"
                aria-label={`Supprimer la réponse ${i + 1}`}
                onClick={() => onSupprimer(p.cle)}
                className={CLASSE_BOUTON_ICONE}
              >
                <IconeCroix />
              </button>
            )}
          </div>
        </div>
      ))}
      {vraiFaux || propositions.length >= LIMITES_QCM.reponsesMax ? null : (
        <button
          type="button"
          onClick={onAjouter}
          className="min-h-11 self-start px-1 text-sm font-bold text-bleu-fonce"
        >
          + Ajouter une réponse
        </button>
      )}
    </div>
  );
}
