import { formaterHeure } from "@/lib/dates";
import { formaterNote } from "@/lib/points";
import { formaterDuree } from "@/lib/textes";
import type { EtatEntree } from "@/lib/vue-entree";

type EtatFin = Extract<EtatEntree, { etape: "fin" }>;

/** Fin de l'examen (maquette « Fin de l’examen », décision D14 du plan du lot 5). La correction arrive au lot 7. */
export function EtapeFin({ etat }: { etat: EtatFin }) {
  return (
    <section data-etat="fin" className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col items-center gap-3 pt-3 text-center">
        <h1 className="font-titre text-[32px] leading-[1.05] font-extrabold tracking-tight">
          Examen terminé
        </h1>
        <p className="text-base text-encre-2">
          Tes réponses ont été enregistrées à {formaterHeure(new Date(etat.enregistreesLe))}.
        </p>
      </div>
      <dl className="flex flex-col rounded-2xl border border-ligne bg-carte">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <dt className="text-encre-2">Questions répondues</dt>
          <dd className="font-bold">
            {etat.repondues} / {etat.total}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-ligne-douce px-5 py-4">
          <dt className="text-encre-2">Durée</dt>
          <dd className="font-bold">{formaterDuree(etat.dureeS)}</dd>
        </div>
      </dl>
      {etat.note === null ? (
        <p className="text-center text-base text-encre-2">Ta note te sera communiquée par ton enseignant.</p>
      ) : (
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-bleu-pale px-5 py-5 text-center">
          <p className="text-sm font-bold tracking-[0.06em] text-bleu-fonce uppercase">Ta note</p>
          <p className="font-titre text-5xl font-extrabold">{formaterNote(etat.note)} / 20</p>
        </div>
      )}
      <p className="text-center text-[15px] text-muet">Tu peux fermer cette page.</p>
    </section>
  );
}
