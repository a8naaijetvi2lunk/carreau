import { pluriel } from "@/lib/textes";
import type { EtatEntree } from "@/lib/vue-entree";

type EtatAttente = Extract<EtatEntree, { etape: "attente" }>;

/** Salle d'attente (maquette « Salle d’attente », décision D12) : résumé de l'examen, départ commun à venir. */
export function EtapeAttente({ etat }: { etat: EtatAttente }) {
  const { examen } = etat;
  const lignes: [string, string][] = [
    ["Questions", String(examen.questions)],
    ["Durée", examen.duree],
    ...(examen.dureeTiersTemps
      ? ([["Durée avec ton tiers-temps", examen.dureeTiersTemps]] as [string, string][])
      : []),
    ["Navigation", "Une question à la fois, sans retour"],
    ["Barème", examen.bareme],
  ];
  return (
    <section className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col items-center gap-4 pt-3 text-center">
        <div aria-hidden="true" className="relative flex size-30 items-center justify-center">
          <span className="absolute inset-0 animate-onde rounded-full border-2 border-bleu motion-reduce:animate-none" />
          <span className="absolute inset-0 animate-onde rounded-full border-2 border-bleu [animation-delay:1.2s] motion-reduce:animate-none" />
          <span className="flex size-18 items-center justify-center rounded-full bg-bleu text-blanc">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2.5 2" />
              <path d="M9 2h6" />
            </svg>
          </span>
        </div>
        <h1 className="font-titre text-[32px] leading-[1.05] font-extrabold tracking-tight">
          Bonjour {etat.prenom}
        </h1>
        <p className="text-base text-encre-2">
          Tu es dans la salle d’attente. L’examen démarrera pour tout le monde en même temps.
        </p>
        <p className="text-sm text-muet">
          En attente de {etat.session.enseignant} ·{" "}
          {pluriel(etat.connectes, "étudiant connecté", "étudiants connectés")}
        </p>
      </div>
      <dl aria-label="L’examen" className="flex flex-col rounded-[14px] border border-ligne bg-carte">
        {lignes.map(([terme, valeur]) => (
          <div
            key={terme}
            className="flex justify-between gap-3 border-b border-ligne-douce px-4 py-3.5 text-[15px] last:border-b-0"
          >
            <dt className="text-muet">{terme}</dt>
            <dd className="text-right font-bold">{valeur}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto flex flex-col gap-1.5 text-center">
        <p className="text-[15px] font-bold">Garde l’écran allumé et reste sur cette page.</p>
        <p className="text-sm text-muet">Ce n’est pas toi ? Préviens ton enseignant.</p>
      </div>
    </section>
  );
}
