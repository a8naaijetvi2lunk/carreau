import type { Metadata } from "next";
import Link from "next/link";
import { formaterDateCourte } from "@/lib/dates";
import { executerPage } from "@/lib/page";
import { formaterNote } from "@/lib/points";
import { exigerActeur } from "@/modules/auth";
import { listerResultats } from "@/modules/resultats";

export const metadata: Metadata = { title: "Résultats" };

/** Examens terminés de l'enseignant (D12), du plus récent au plus ancien. */
export default async function PageResultats() {
  const examens = await executerPage(async () => listerResultats(await exigerActeur()));
  return (
    <>
      <h1 className="font-titre text-4xl leading-[1.05] font-extrabold tracking-tight">Résultats</h1>
      <section className="flex max-w-4xl flex-col overflow-hidden rounded-2xl border border-ligne bg-carte">
        {examens.length === 0 ? (
          <p className="px-5 py-4 text-[15px] text-muet">Aucun examen terminé pour l’instant.</p>
        ) : (
          <ul aria-label="Examens terminés">
            {examens.map((e, i) => (
              <li key={e.sessionId} className={i === 0 ? "" : "border-t border-ligne-douce"}>
                <Link
                  href={`/enseignant/resultats/${e.sessionId}`}
                  className="grid gap-1 px-5 py-3 text-encre hover:bg-papier md:grid-cols-[minmax(0,1fr)_10rem_9rem_7rem] md:items-center md:gap-4"
                >
                  <strong className="min-w-0 truncate">
                    {e.titre} · {e.classe}
                  </strong>
                  <span className="text-sm text-muet">{formaterDateCourte(new Date(e.demarreLe))}</span>
                  <span className="text-sm">
                    {e.presents} / {e.effectif} présents
                  </span>
                  <span className="font-code text-sm">
                    {e.moyenne === null ? "—" : `${formaterNote(e.moyenne)} / 20`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
