import { Bouton } from "@/components/ui";
import type { ResultatAction } from "@/lib/action";
import { formaterHeure } from "@/lib/dates";
import { LIBELLES_MOTIF_DEMANDE, nomComplet } from "@/lib/regles-session";
import type { DemandeSuivi } from "@/lib/vue-session";
import { autoriserDemandeAction, refuserDemandeAction } from "../actions";

/** Demandes d'appareil en attente (maquette « Suivi en direct ») : autoriser ou refuser (décision D10). */
export function ListeDemandes({
  demandes,
  enCours,
  onDecider,
}: {
  demandes: DemandeSuivi[];
  enCours: boolean;
  onDecider: (action: () => Promise<ResultatAction<null>>) => void;
}) {
  if (demandes.length === 0) return null;
  return (
    <section
      aria-labelledby="demandes-appareil"
      className="flex flex-col gap-3 rounded-2xl border border-ambre bg-orange-pale p-5"
    >
      <h2 id="demandes-appareil" className="text-lg font-bold text-orange-fonce">
        Demandes d’appareil
      </h2>
      <ul className="flex flex-col gap-3">
        {demandes.map((d) => {
          const nom = nomComplet(d.prenom, d.nom);
          return (
            <li key={d.demandeId} className="flex flex-col gap-2 rounded-xl border border-ligne bg-carte p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{LIBELLES_MOTIF_DEMANDE[d.motif]}</strong>
                <span className="font-code text-sm text-muet">{formaterHeure(new Date(d.creeLe))}</span>
              </div>
              <p className="text-[15px] text-encre-2">
                {nom} —{" "}
                {d.motif === "reprise"
                  ? "demande à reprendre l’examen sur un autre téléphone."
                  : "nouvelle connexion depuis un 2e téléphone."}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
                <Bouton
                  disabled={enCours}
                  aria-label={`Autoriser la demande de ${nom}`}
                  onClick={() => onDecider(() => autoriserDemandeAction(d.demandeId))}
                >
                  Autoriser
                </Bouton>
                <Bouton
                  variante="secondaire"
                  disabled={enCours}
                  aria-label={`Refuser la demande de ${nom}`}
                  onClick={() => onDecider(() => refuserDemandeAction(d.demandeId))}
                >
                  Refuser
                </Bouton>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
