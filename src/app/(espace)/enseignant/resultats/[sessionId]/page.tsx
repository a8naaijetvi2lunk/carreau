import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alerte, classesBouton } from "@/components/ui";
import { formaterHeure, formaterJour } from "@/lib/dates";
import { executerPage } from "@/lib/page";
import { exigerActeur } from "@/modules/auth";
import { lireResultats } from "@/modules/resultats";
import { TableauResultats } from "./TableauResultats";

export const metadata: Metadata = { title: "Résultats" };

function IconeTelechargement() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

/** Résultats d'un examen (D12) ; un rattrapage renvoie aux résultats de sa session d'origine. */
export default async function PageResultatsSession(props: PageProps<"/enseignant/resultats/[sessionId]">) {
  const { sessionId } = await props.params;
  const resultats = await executerPage(async () => lireResultats(await exigerActeur(), { sessionId }));
  if (!resultats.disponible) {
    return (
      <>
        <h1 className="font-titre text-3xl leading-[1.05] font-extrabold tracking-tight">
          {resultats.titre}
        </h1>
        <Alerte>
          {resultats.statut === "annulee"
            ? "Cette session a été annulée : elle n’a pas de résultats."
            : "Les résultats seront disponibles à la fin de l’examen."}
        </Alerte>
        <Link href={`/enseignant/sessions/${resultats.sessionId}`} className="font-bold text-bleu underline">
          Retour au pilotage de la session
        </Link>
      </>
    );
  }
  const { vue } = resultats;
  if (vue.sessionId !== sessionId) redirect(`/enseignant/resultats/${vue.sessionId}`);
  const demarreLe = new Date(vue.demarreLe);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <nav aria-label="Fil d’Ariane" className="text-[15px] text-muet">
            <Link href="/enseignant/resultats" className="underline">
              Résultats
            </Link>{" "}
            / {vue.classe}
          </nav>
          <h1 className="font-titre text-3xl leading-[1.05] font-extrabold tracking-tight">{vue.titre}</h1>
          <p className="text-[15px] text-encre-2">
            Session du {formaterJour(demarreLe)} · {formaterHeure(demarreLe)} · {vue.duree}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/enseignant/resultats/${vue.sessionId}/csv`}
            download
            className={classesBouton("secondaire")}
          >
            <IconeTelechargement />
            Exporter en CSV
          </a>
          <a href={`/api/enseignant/resultats/${vue.sessionId}/xlsx`} download className={classesBouton()}>
            <IconeTelechargement />
            Exporter en Excel
          </a>
        </div>
      </div>
      <TableauResultats vue={vue} />
    </>
  );
}
