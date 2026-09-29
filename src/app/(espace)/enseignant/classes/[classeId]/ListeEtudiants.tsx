"use client";

import { useState } from "react";
import { Champ } from "@/components/ui";
import { correspondANom } from "@/lib/noms";
import type { EtudiantClasse } from "@/modules/classes";
import { GRILLE_ETUDIANTS, LigneEtudiant } from "./LigneEtudiant";

/** Étudiants de la classe avec la recherche de la maquette (début du nom ou du prénom, sans accents). */
export function ListeEtudiants({ etudiants }: { etudiants: EtudiantClasse[] }) {
  const [recherche, setRecherche] = useState("");
  const visibles = etudiants.filter((e) => correspondANom(recherche, e.nom, e.prenom));
  if (etudiants.length === 0) {
    return (
      <p className="text-[15px] text-muet">
        Aucun étudiant pour l’instant : importe la liste de la classe ou ajoute les étudiants un par un.
      </p>
    );
  }
  return (
    <section aria-labelledby="etudiants-classe" className="flex flex-col gap-3">
      <h3 id="etudiants-classe" className="text-base font-bold">
        Étudiants
      </h3>
      <div className="md:max-w-90">
        <Champ
          id="recherche-etudiant"
          type="search"
          libelle="Rechercher un étudiant"
          placeholder="Nom ou prénom"
          autoComplete="off"
          value={recherche}
          onChange={(evenement) => setRecherche(evenement.target.value)}
        />
      </div>
      <div className="flex flex-col overflow-hidden rounded-xl border border-ligne-douce">
        <div
          aria-hidden="true"
          className={`hidden bg-papier px-4 py-2 text-xs font-bold tracking-[0.06em] text-muet uppercase ${GRILLE_ETUDIANTS}`}
        >
          <span>Nom</span>
          <span>Prénom</span>
          <span>Tiers-temps</span>
          <span />
        </div>
        <ul aria-label="Étudiants de la classe" className="flex flex-col">
          {visibles.map((e) => (
            <LigneEtudiant key={e.id} etudiant={e} />
          ))}
        </ul>
        {visibles.length === 0 ? (
          <p className="border-t border-ligne-douce px-4 py-3 text-[15px] text-muet">
            Aucun étudiant ne correspond à « {recherche} ».
          </p>
        ) : null}
      </div>
    </section>
  );
}
