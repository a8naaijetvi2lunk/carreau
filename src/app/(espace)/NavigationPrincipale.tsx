"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type LienNavigation = {
  href: string;
  libelle: string;
  icone: "accueil" | "classes" | "enseignants" | "parametres";
  /** Actif seulement sur son adresse exacte (l'accueil /enseignant ne doit pas l'être sur /enseignant/classes). */
  exact?: boolean;
};

function Icone({ children }: { children: ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ICONES: Record<LienNavigation["icone"], ReactNode> = {
  accueil: (
    <Icone>
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 9.5V20h5v-6h4v6h5V9.5" />
    </Icone>
  ),
  classes: (
    <Icone>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
      <path d="M18 14.5c2.2.6 3.5 2.7 3.5 5.5" />
    </Icone>
  ),
  enseignants: (
    <Icone>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 20c0-3.6 2.9-6 6.5-6 1.6 0 3 .5 4.2 1.3" />
      <path d="M18 14v6" />
      <path d="M15 17h6" />
    </Icone>
  ),
  parametres: (
    <Icone>
      <path d="M4 21v-7" />
      <path d="M4 10V3" />
      <path d="M12 21v-9" />
      <path d="M12 8V3" />
      <path d="M20 21v-5" />
      <path d="M20 12V3" />
      <path d="M1.5 14h5" />
      <path d="M9.5 8h5" />
      <path d="M17.5 16h5" />
    </Icone>
  ),
};

export function NavigationPrincipale({ liens }: { liens: LienNavigation[] }) {
  const chemin = usePathname();
  return (
    <ul className="flex flex-wrap gap-1 md:flex-col">
      {liens.map((lien) => {
        const actif = lien.exact
          ? chemin === lien.href
          : chemin === lien.href || chemin.startsWith(`${lien.href}/`);
        return (
          <li key={lien.href}>
            <Link
              href={lien.href}
              aria-current={actif ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] ${
                actif ? "bg-bleu-pale font-bold text-bleu-fonce" : "text-encre hover:bg-papier"
              }`}
            >
              {ICONES[lien.icone]}
              <span>{lien.libelle}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
