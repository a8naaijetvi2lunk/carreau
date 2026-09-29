import { formaterHeure } from "@/lib/dates";
import type { EtatEnregistrement } from "@/lib/enregistreur";

/** Indicateur d'enregistrement automatique (maquette : « Brouillon enregistré à 10:12 »). */
export function StatutEnregistrement({ etat }: { etat: EtatEnregistrement }) {
  let texte = "";
  if (etat.etape === "modifie") texte = "Modifications non enregistrées";
  else if (etat.etape === "enCours") texte = "Enregistrement…";
  else if (etat.etape === "enregistre") texte = `Enregistré à ${formaterHeure(etat.le)}`;
  else if (etat.etape === "erreur") texte = `Échec de l’enregistrement : ${etat.message}`;
  return (
    <p
      role="status"
      className={`min-h-5 text-[13px] ${etat.etape === "erreur" ? "font-bold text-orange-fonce" : "text-muet"}`}
    >
      {texte}
    </p>
  );
}
