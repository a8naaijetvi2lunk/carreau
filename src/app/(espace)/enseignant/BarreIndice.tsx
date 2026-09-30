import { tonIndice } from "./sessions/libelles";

const COULEURS_INDICE = {
  fort: { texte: "text-orange-fonce", barre: "bg-orange-fonce" },
  moyen: { texte: "text-encre", barre: "bg-ambre" },
  faible: { texte: "text-muet", barre: "bg-ligne-forte" },
};

/** Indice de suspicion en nombre et en barre (D14 du plan du lot 6) ; « — » sans indice. */
export function BarreIndice({ indice }: { indice: number | null }) {
  if (indice === null) return <span className="text-sm text-muet">—</span>;
  const couleurs = COULEURS_INDICE[tonIndice(indice)];
  return (
    <span className="flex items-center gap-2" aria-label={`Indice ${indice} sur 100`}>
      <span aria-hidden="true" className={`w-8 text-right font-code font-bold ${couleurs.texte}`}>
        {indice}
      </span>
      <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-full bg-ligne-douce">
        <span className={`block h-full rounded-full ${couleurs.barre}`} style={{ width: `${indice}%` }} />
      </span>
    </span>
  );
}
