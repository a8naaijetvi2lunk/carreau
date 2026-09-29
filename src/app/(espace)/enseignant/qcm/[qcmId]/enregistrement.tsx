"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useState, type ComponentProps, type ReactNode } from "react";
import { RegistreVidanges } from "@/lib/enregistreur";

const ContexteVidanges = createContext<RegistreVidanges | null>(null);

/** Registre des enregistrements en attente de la page de l'éditeur (décision D8). */
export function FournisseurEnregistrement({ children }: { children: ReactNode }) {
  const [registre] = useState(() => new RegistreVidanges());
  return <ContexteVidanges value={registre}>{children}</ContexteVidanges>;
}

/** Registre de la page ; null hors de l'éditeur. */
export function useRegistreVidanges(): RegistreVidanges | null {
  return useContext(ContexteVidanges);
}

/**
 * Lien de l'éditeur qui attend l'enregistrement de la question en cours avant de naviguer. Si
 * l'enregistrement échoue, il reste sur place : l'erreur est affichée par l'éditeur. Un clic avec
 * Ctrl, Cmd, Maj, Alt ou un autre bouton que le gauche garde le comportement du navigateur.
 */
export function LienSansPerte({
  href,
  onClick,
  ...proprietes
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const router = useRouter();
  const registre = useRegistreVidanges();
  return (
    <Link
      href={href}
      {...proprietes}
      onClick={(evenement) => {
        onClick?.(evenement);
        if (
          evenement.defaultPrevented ||
          !registre ||
          evenement.button !== 0 ||
          evenement.metaKey ||
          evenement.ctrlKey ||
          evenement.shiftKey ||
          evenement.altKey
        ) {
          return;
        }
        evenement.preventDefault();
        void registre.toutVidanger().then((enregistre) => {
          if (enregistre) router.push(href);
        });
      }}
    />
  );
}
