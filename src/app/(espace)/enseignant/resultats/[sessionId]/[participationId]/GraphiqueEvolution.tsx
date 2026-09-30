import { GRAPHIQUE_EVOLUTION, geometrieEvolution } from "@/lib/evolution";
import type { PointEvolution } from "@/lib/vue-resultats";

/** Évolution (maquette « Rapport étudiant ») : note sur 20 en ligne, indice sur 100 en barres. */
export function GraphiqueEvolution({ evolution }: { evolution: PointEvolution[] }) {
  const g = GRAPHIQUE_EVOLUTION;
  const { points, chemin } = geometrieEvolution(evolution);
  const milieu = (g.bas + g.haut) / 2;
  return (
    <svg
      viewBox={`0 0 ${g.largeur} ${g.hauteur}`}
      width="100%"
      role="img"
      aria-label={`Évolution des notes et de l’indice sur ${evolution.length} examen${evolution.length > 1 ? "s" : ""}`}
      className="block"
    >
      <path d={`M${g.gauche} ${g.bas}H${g.droite}`} className="stroke-ligne" strokeWidth="1" />
      <path
        d={`M${g.gauche} ${milieu}H${g.droite}`}
        className="stroke-ligne-douce"
        strokeWidth="1"
        strokeDasharray="4 4"
      />
      <path
        d={`M${g.gauche} ${g.haut}H${g.droite}`}
        className="stroke-ligne-douce"
        strokeWidth="1"
        strokeDasharray="4 4"
      />
      {points.map((p, i) =>
        p.barre ? (
          <rect
            key={`barre-${i}`}
            x={p.barre.x}
            y={p.barre.y}
            width={g.largeurBarre}
            height={p.barre.hauteur}
            className={p.barre.fort ? "fill-orange-fonce" : "fill-ligne-forte"}
          />
        ) : null,
      )}
      {chemin ? (
        <path d={chemin} fill="none" className="stroke-bleu" strokeWidth="3" strokeLinejoin="round" />
      ) : null}
      {points.map((p, i) => (
        <circle
          key={`note-${i}`}
          cx={p.x}
          cy={p.yNote}
          r="5"
          className="fill-bleu stroke-carte"
          strokeWidth="2"
        />
      ))}
      {points.map((p, i) => (
        <text
          key={`date-${i}`}
          x={p.x}
          y={g.etiquettes}
          textAnchor="middle"
          fontSize="12"
          className="fill-muet"
        >
          {p.etiquette}
        </text>
      ))}
    </svg>
  );
}
