import { IconeLien } from "./icones";

export type VoisineLiaison = { id: string; numero: number; lieeASuivante: boolean };

const CLASSE_LIAISON =
  "inline-flex min-h-11 items-center rounded-lg border border-bleu bg-carte px-3 text-[13px] font-bold text-bleu-fonce disabled:opacity-60";

/**
 * Liaisons de la question (spec §4.2, maquette « Éditeur de QCM ») : bandeau quand elle est liée à la
 * précédente ou à la suivante, boutons pour lier ou délier. `onLier(id, liee)` s'applique à la question
 * du dessus de la paire, qui porte la liaison.
 */
export function BandeauLiaison({
  questionId,
  precedente,
  suivante,
  lieeASuivante,
  lectureSeule,
  desactive,
  onLier,
}: {
  questionId: string;
  precedente: VoisineLiaison | null;
  suivante: { id: string; numero: number } | null;
  lieeASuivante: boolean;
  lectureSeule: boolean;
  desactive: boolean;
  onLier: (questionId: string, lieeASuivante: boolean) => void;
}) {
  const auDessus = precedente?.lieeASuivante ? precedente : null;
  const auDessous = lieeASuivante && suivante ? suivante : null;
  const liees = [auDessus?.numero, auDessous?.numero].filter((n): n is number => n !== undefined);
  const boutons = lectureSeule
    ? []
    : [
        ...(precedente && !auDessus
          ? [{ libelle: "Lier à la question du dessus", id: precedente.id, liee: true }]
          : []),
        ...(suivante && !auDessous
          ? [{ libelle: "Lier à la question du dessous", id: questionId, liee: true }]
          : []),
        ...(auDessus
          ? [{ libelle: `Délier de la question ${auDessus.numero}`, id: auDessus.id, liee: false }]
          : []),
        ...(auDessous
          ? [{ libelle: `Délier de la question ${auDessous.numero}`, id: questionId, liee: false }]
          : []),
      ];
  if (liees.length === 0 && boutons.length === 0) return null;
  const actions =
    boutons.length > 0 ? (
      <div className="flex flex-wrap gap-2">
        {boutons.map((b) => (
          <button
            key={b.libelle}
            type="button"
            disabled={desactive}
            onClick={() => onLier(b.id, b.liee)}
            className={CLASSE_LIAISON}
          >
            {b.libelle}
          </button>
        ))}
      </div>
    ) : null;
  if (liees.length === 0) return actions;
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-bleu-pale bg-bleu-pale px-3.5 py-3 text-sm md:flex-row md:flex-wrap md:items-center">
      <p className="flex flex-1 items-start gap-2.5 text-encre">
        <span className="mt-0.5 text-bleu-fonce">
          <IconeLien />
        </span>
        <span>
          <strong>
            {liees.length === 1
              ? `Liée à la question ${liees[0]}.`
              : `Liée aux questions ${liees[0]} et ${liees[1]}.`}
          </strong>{" "}
          Elles restent consécutives, dans cet ordre, où qu’elles tombent dans le mélange.
        </span>
      </p>
      {actions}
    </div>
  );
}
