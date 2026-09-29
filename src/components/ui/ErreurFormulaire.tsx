import type { ResultatAction } from "@/lib/action";
import { erreursParChamp } from "@/lib/formulaire";
import { Alerte } from "./Alerte";

/** Erreur d'un formulaire ; le détail par champ, s'il existe, s'affiche sous chaque champ. */
export function ErreurFormulaire({ etat }: { etat: ResultatAction<unknown> | null }) {
  if (!etat || etat.ok) return null;
  const parChamp = Object.keys(erreursParChamp(etat.erreur.details)).length > 0;
  return <Alerte ton="erreur">{parChamp ? "Vérifie les champs signalés." : etat.erreur.message}</Alerte>;
}
