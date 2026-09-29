import Link from "next/link";
import type { ClasseResume } from "@/modules/classes";

const LIEN_SECONDAIRE = "flex min-h-11 items-center px-3.5 text-sm font-bold text-bleu underline";

/** Colonne de gauche de la maquette « Classes » : classes en cours, ou archivées. */
export function ListeClasses({
  classes,
  archivees,
  selection,
}: {
  classes: ClasseResume[];
  archivees: boolean;
  selection?: string;
}) {
  const visibles = classes.filter((c) => c.archivee === archivees);
  const autres = classes.length - visibles.length;
  return (
    <nav aria-label="Classes" className="flex flex-col gap-1 rounded-2xl border border-ligne bg-carte p-2.5">
      {visibles.length === 0 ? (
        <p className="px-3.5 py-3 text-[15px] text-muet">
          {archivees ? "Aucune classe archivée." : "Aucune classe pour l’instant."}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {visibles.map((c) => {
            const active = c.id === selection;
            return (
              <li key={c.id}>
                <Link
                  href={`/enseignant/classes/${c.id}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-13 items-center justify-between gap-3 rounded-[10px] px-3.5 ${
                    active ? "bg-bleu-pale text-bleu-fonce" : "text-encre hover:bg-papier"
                  }`}
                >
                  <strong className="min-w-0 truncate text-base">{c.nom}</strong>{" "}
                  <span className={`shrink-0 text-sm ${active ? "" : "text-muet"}`}>
                    {c.effectif}
                    <span className="sr-only"> {c.effectif > 1 ? "étudiants" : "étudiant"}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {archivees ? (
        <Link href="/enseignant/classes" className={LIEN_SECONDAIRE}>
          Classes en cours
        </Link>
      ) : autres > 0 ? (
        <Link href="/enseignant/classes?archivees=1" className={LIEN_SECONDAIRE}>
          Classes archivées ({autres})
        </Link>
      ) : null}
    </nav>
  );
}
