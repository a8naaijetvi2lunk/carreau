import Link from "next/link";
import { Etiquette } from "@/components/ui";
import { formaterDateCourte } from "@/lib/dates";
import { LIBELLES_STATUT } from "@/lib/regles-qcm";
import type { QcmResume } from "@/modules/qcm";
import { libelleQuestions, TONS_STATUT } from "./libelles";

const LIEN_SECONDAIRE = "flex min-h-11 items-center px-5 text-sm font-bold text-bleu underline";

/** Tableau « Mes QCM » (maquette « Accueil ») : QCM en cours, ou archivés. */
export function ListeQcm({ qcm, archives }: { qcm: QcmResume[]; archives: boolean }) {
  const visibles = qcm.filter((q) => (q.statut === "archive") === archives);
  const autres = qcm.length - visibles.length;
  const titre = archives ? "QCM archivés" : "Mes QCM";
  return (
    <section
      aria-labelledby="liste-qcm"
      className="flex flex-col overflow-hidden rounded-2xl border border-ligne bg-carte"
    >
      <h2 id="liste-qcm" className="px-5 pt-4 pb-3 text-lg font-bold">
        {titre}
      </h2>
      {visibles.length === 0 ? (
        <p className="px-5 pb-4 text-[15px] text-muet">
          {archives ? "Aucun QCM archivé." : "Aucun QCM pour l’instant : crée le premier."}
        </p>
      ) : (
        <ul aria-label={titre}>
          {visibles.map((q) => (
            <li key={q.id} className="border-t border-ligne-douce">
              <Link
                href={`/enseignant/qcm/${q.id}`}
                className="grid gap-1.5 px-5 py-3 text-encre hover:bg-papier md:grid-cols-[minmax(0,1fr)_7rem_6rem_10rem] md:items-center md:gap-4"
              >
                <span className="flex min-w-0 flex-col items-start gap-1">
                  <strong className="max-w-full truncate text-base">{q.titre}</strong>
                  {q.origine === "mcp" ? <Etiquette ton="bleu">Créé via MCP · à relire</Etiquette> : null}
                </span>
                <span className="font-code text-sm">{libelleQuestions(q.nombreQuestions)}</span>
                <span>
                  <Etiquette ton={TONS_STATUT[q.statut]}>{LIBELLES_STATUT[q.statut]}</Etiquette>
                </span>
                <span className="text-sm text-muet">Modifié le {formaterDateCourte(q.modifieLe)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {archives ? (
        <Link href="/enseignant/qcm" className={LIEN_SECONDAIRE}>
          QCM en cours
        </Link>
      ) : autres > 0 ? (
        <Link href="/enseignant/qcm?archives=1" className={LIEN_SECONDAIRE}>
          QCM archivés ({autres})
        </Link>
      ) : null}
    </section>
  );
}
