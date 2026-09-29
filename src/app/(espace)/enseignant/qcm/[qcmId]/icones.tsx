/** Icônes de l'éditeur (maquette « Éditeur de QCM ») : décoratives, le nom accessible est porté par le bouton. */
import type { ReactNode } from "react";

function Icone({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconeImage() {
  return (
    <Icone>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 17l-5-5-9 8" />
    </Icone>
  );
}

export function IconeCode() {
  return (
    <Icone>
      <path d="M8 7l-5 5 5 5" />
      <path d="M16 7l5 5-5 5" />
    </Icone>
  );
}

export function IconeCroix() {
  return (
    <Icone>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </Icone>
  );
}

export function IconeLien() {
  return (
    <Icone>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </Icone>
  );
}
