import { Bouton, Etiquette } from "@/components/ui";
import { nomComplet } from "@/lib/regles-session";
import type { VueSuivi } from "@/lib/vue-session";

/** Étudiants dans la salle et pas encore connectés (maquette « Écran projeté ») ; « Retirer » en salle d'attente. */
export function ListesSalle({
  suivi,
  enCours,
  onRetirer,
}: {
  suivi: VueSuivi;
  enCours: boolean;
  onRetirer: (participationId: string) => void;
}) {
  const retirable = suivi.statut === "attente";
  return (
    <>
      <section
        aria-labelledby="dans-la-salle"
        className="flex flex-col overflow-hidden rounded-2xl border border-ligne bg-carte"
      >
        <h2 id="dans-la-salle" className="px-5 pt-4 pb-3 text-lg font-bold">
          Dans la salle · {suivi.participants.length} / {suivi.effectif}
        </h2>
        {suivi.participants.length === 0 ? (
          <p className="px-5 pb-4 text-[15px] text-muet">Personne pour l’instant : projette le QR code.</p>
        ) : (
          <ul aria-label="Étudiants dans la salle">
            {suivi.participants.map((p) => {
              const nom = nomComplet(p.prenom, p.nom);
              return (
                <li
                  key={p.participationId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ligne-douce px-5 py-2.5"
                >
                  <span className="min-w-0 flex-1 text-[15px] font-bold">{nom}</span>
                  {p.tiersTemps ? <Etiquette ton="bleu">Tiers-temps</Etiquette> : null}
                  {p.informationLue ? null : <Etiquette>Lit les informations</Etiquette>}
                  {retirable ? (
                    <Bouton
                      variante="secondaire"
                      disabled={enCours}
                      aria-label={`Retirer ${nom}`}
                      onClick={() => onRetirer(p.participationId)}
                    >
                      Retirer
                    </Bouton>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section
        aria-labelledby="pas-connectes"
        className="flex flex-col gap-2 rounded-2xl border border-ligne bg-carte p-5"
      >
        <h2 id="pas-connectes" className="text-lg font-bold">
          Pas encore connectés · {suivi.absents.length}
        </h2>
        {suivi.absents.length === 0 ? (
          <p className="text-[15px] text-muet">Toute la classe est là.</p>
        ) : (
          <p className="text-[15px] text-encre-2">
            {suivi.absents.map((a) => nomComplet(a.prenom, a.nom)).join(", ")}
          </p>
        )}
      </section>
    </>
  );
}
