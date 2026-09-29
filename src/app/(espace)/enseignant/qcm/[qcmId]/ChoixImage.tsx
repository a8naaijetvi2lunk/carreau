"use client";

import { useState, type ReactNode } from "react";
import { TYPES_IMAGE_ACCEPTES, type ImageVue } from "@/lib/images";
import { CLASSE_BOUTON_ICONE, CLASSE_OUTIL } from "./styles";
import { envoyerImage } from "./televersement";

/**
 * Bouton « Image » : un champ fichier porté par son libellé. L'image est envoyée tout de suite ; son
 * identifiant rejoint la question, enregistrée ensuite avec elle.
 */
export function ChoixImage({
  etiquette,
  onImage,
  compact = false,
  children,
}: {
  etiquette: string;
  onImage: (image: ImageVue) => void;
  compact?: boolean;
  children: ReactNode;
}) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function choisir(champ: HTMLInputElement): Promise<void> {
    const fichier = champ.files?.[0];
    // Vidé tout de suite : choisir de nouveau le même fichier redéclenche l'envoi.
    champ.value = "";
    if (!fichier) return;
    setErreur(null);
    setEnvoi(true);
    const resultat = await envoyerImage(fichier);
    setEnvoi(false);
    if (resultat.ok) onImage(resultat.image);
    else setErreur(resultat.message);
  }

  return (
    <div className="flex flex-col gap-1">
      <label
        className={`${compact ? CLASSE_BOUTON_ICONE : CLASSE_OUTIL} cursor-pointer focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-bleu has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60`}
      >
        {children}
        <input
          type="file"
          accept={TYPES_IMAGE_ACCEPTES}
          aria-label={etiquette}
          disabled={envoi}
          className="sr-only"
          onChange={(evenement) => void choisir(evenement.currentTarget)}
        />
      </label>
      {envoi ? (
        <p role="status" className="text-[13px] text-muet">
          Envoi de l’image…
        </p>
      ) : null}
      {erreur ? (
        <p role="alert" className="max-w-xs text-[13px] font-bold text-orange-fonce">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}
