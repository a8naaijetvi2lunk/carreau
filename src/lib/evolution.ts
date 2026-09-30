/**
 * Graphique d'évolution du rapport étudiant (maquette « Rapport étudiant », décision D9 du plan du
 * lot 7) : note sur 20 en ligne, indice sur 100 en barres. Géométrie seule, rendue en SVG par la page.
 */
import { formaterJourCourt } from "./dates";
import { SEUIL_INDICE_ELEVE } from "./regles-resultats";

export const GRAPHIQUE_EVOLUTION = {
  largeur: 400,
  hauteur: 220,
  gauche: 20,
  droite: 390,
  /** Axe des abscisses. */
  bas: 180,
  /** Sommet du tracé (note 20, indice 100). */
  haut: 20,
  largeurBarre: 28,
  /** Ligne des étiquettes de date. */
  etiquettes: 204,
} as const;

export type PointGraphique = {
  x: number;
  yNote: number;
  barre: { x: number; y: number; hauteur: number; fort: boolean } | null;
  etiquette: string;
};

function arrondi(valeur: number): number {
  return Math.round(valeur * 10) / 10;
}

export function geometrieEvolution(serie: readonly { note: number; indice: number | null; le: string }[]): {
  points: PointGraphique[];
  chemin: string;
} {
  const g = GRAPHIQUE_EVOLUTION;
  const pas = (g.droite - g.gauche) / Math.max(1, serie.length);
  const hauteurUtile = g.bas - g.haut;
  const points = serie.map((point, i): PointGraphique => {
    const x = arrondi(g.gauche + pas * (i + 0.5));
    const hauteur = point.indice === null ? 0 : arrondi((point.indice / 100) * hauteurUtile);
    return {
      x,
      yNote: arrondi(g.bas - (point.note / 20) * hauteurUtile),
      barre:
        point.indice === null
          ? null
          : {
              x: arrondi(x - g.largeurBarre / 2),
              y: arrondi(g.bas - hauteur),
              hauteur,
              fort: point.indice >= SEUIL_INDICE_ELEVE,
            },
      etiquette: formaterJourCourt(new Date(point.le)),
    };
  });
  const chemin = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.yNote}`).join("");
  return { points, chemin };
}
