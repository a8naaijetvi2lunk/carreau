import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alerte, Etiquette } from "@/components/ui";
import { formaterHeureSecondes, formaterJour } from "@/lib/dates";
import { executerPage } from "@/lib/page";
import { formaterNote } from "@/lib/points";
import { MENTION_RAPPORT, SEUIL_INDICE_ELEVE } from "@/lib/regles-resultats";
import { nomComplet } from "@/lib/regles-session";
import type { SorteChronologie } from "@/lib/vue-resultats";
import { exigerActeur } from "@/modules/auth";
import { lireRapport } from "@/modules/resultats";
import { GraphiqueEvolution } from "./GraphiqueEvolution";

export const metadata: Metadata = { title: "Rapport étudiant" };

const POINTS: Record<SorteChronologie, string> = {
  repere: "bg-bleu",
  mineur: "bg-ligne-forte",
  notable: "bg-orange-fonce",
};

function Carte({
  libelle,
  valeur,
  sur,
  fort = false,
}: {
  libelle: string;
  valeur: string;
  sur: string;
  fort?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-0.5 rounded-2xl border px-5 py-3.5 ${fort ? "border-orange bg-orange-pale" : "border-ligne bg-carte"}`}
    >
      <dt className={`text-sm ${fort ? "text-orange-fonce" : "text-encre-2"}`}>{libelle}</dt>
      <dd className={`font-titre text-3xl font-extrabold ${fort ? "text-orange-fonce" : ""}`}>
        {valeur} <span className="text-lg text-encre-2">/ {sur}</span>
      </dd>
    </div>
  );
}

/** Rapport d'un étudiant (maquette « Rapport étudiant », D9 et D12). */
export default async function PageRapport(
  props: PageProps<"/enseignant/resultats/[sessionId]/[participationId]">,
) {
  const { sessionId, participationId } = await props.params;
  const rapport = await executerPage(async () => lireRapport(await exigerActeur(), { participationId }));
  // Une seule adresse par rapport : celle de la session d'origine de l'examen.
  const racineId = rapport.disponible ? rapport.vue.sessionId : rapport.sessionId;
  if (racineId !== sessionId) redirect(`/enseignant/resultats/${racineId}/${participationId}`);
  if (!rapport.disponible) {
    return (
      <>
        <h1 className="font-titre text-3xl font-extrabold tracking-tight">
          {nomComplet(rapport.prenom, rapport.nom)}
        </h1>
        <Alerte>Le rapport sera disponible à la fin du passage de cet étudiant.</Alerte>
      </>
    );
  }
  const { vue } = rapport;
  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href={`/enseignant/resultats/${vue.sessionId}`} className="text-sm font-bold text-bleu">
          ← Résultats · {vue.titre}
        </Link>
        <h1 className="font-titre text-3xl leading-[1.05] font-extrabold tracking-tight">
          {nomComplet(vue.prenom, vue.nom)}
        </h1>
        <p className="flex flex-wrap items-center gap-2 text-[15px] text-encre-2">
          {vue.classe} · {vue.titre} · {formaterJour(new Date(vue.le))}
          {vue.rattrapage ? <Etiquette>Rattrapage</Etiquette> : null}
          {vue.tiersTemps ? <Etiquette ton="bleu">Tiers-temps</Etiquette> : null}
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_27rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <dl className="grid gap-3 sm:grid-cols-3">
            <Carte libelle="Note" valeur={formaterNote(vue.note)} sur="20" />
            <Carte libelle="Bonnes réponses" valeur={String(vue.bonnes)} sur={String(vue.questions)} />
            <Carte
              libelle="Indice de suspicion"
              valeur={vue.indice ? String(vue.indice.valeur) : "—"}
              sur="100"
              fort={(vue.indice?.valeur ?? 0) >= SEUIL_INDICE_ELEVE}
            />
          </dl>
          <section
            aria-labelledby="detail-indice"
            className="flex flex-col rounded-2xl border border-ligne bg-carte px-5 py-4"
          >
            <h2 id="detail-indice" className="pb-2 text-lg font-bold">
              Détail de l’indice
            </h2>
            {vue.indice === null || vue.indice.lignes.length === 0 ? (
              <p className="text-[15px] text-muet">Aucun événement compté.</p>
            ) : (
              <table className="w-full text-[15px]">
                <tbody>
                  {vue.indice.lignes.map((l) => (
                    <tr key={l.signal} className="border-b border-ligne-douce">
                      <th scope="row" className="py-2.5 text-left font-normal">
                        {l.libelle}
                      </th>
                      <td className="py-2.5 text-encre-2">
                        {l.nombre}
                        {l.precision ? ` · ${l.precision}` : ""}
                      </td>
                      <td className="py-2.5 text-right font-code font-semibold">
                        {l.points > 0 ? `+${l.points}` : "non compté"}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="py-2.5 text-left font-bold">
                      Total{vue.indice.plafonne ? " (plafonné à 100)" : ""}
                    </th>
                    <td />
                    <td className="py-2.5 text-right font-code font-bold text-orange-fonce">
                      {vue.indice.valeur}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </section>
          <section
            aria-labelledby="chronologie"
            className="flex flex-col rounded-2xl border border-ligne bg-carte px-5 py-4"
          >
            <h2 id="chronologie" className="pb-2 text-lg font-bold">
              Chronologie
            </h2>
            <ol className="flex flex-col">
              {vue.chronologie.map((e, i) => (
                <li
                  key={i}
                  className="grid grid-cols-[4.5rem_2.5rem_0.75rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-ligne-douce py-2.5 text-[15px] last:border-b-0"
                >
                  <span className="font-code text-[13px] text-muet">
                    {formaterHeureSecondes(new Date(e.le))}
                  </span>
                  <span className="font-code text-[13px] font-semibold">
                    {e.question === null ? "—" : `Q${e.question}`}
                  </span>
                  <span aria-hidden="true" className={`size-2.5 rounded-full ${POINTS[e.sorte]}`} />
                  <span className={e.sorte === "notable" ? "font-bold" : ""}>{e.texte}</span>
                  <span className="font-code text-[13px] text-encre-2">
                    {e.dureeS === null ? "" : `${e.dureeS} s`}
                  </span>
                </li>
              ))}
            </ol>
            <p className="pt-2 text-[13px] text-muet">Questions numérotées dans l’ordre du QCM.</p>
          </section>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <section
            aria-labelledby="evolution"
            className="flex flex-col gap-3 rounded-2xl border border-ligne bg-carte px-5 py-4"
          >
            <h2 id="evolution" className="text-lg font-bold">
              Évolution
            </h2>
            <p className="flex gap-4 text-[13px] text-encre-2">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-[3px] w-4 bg-bleu" />
                Note sur 20
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-3 w-2.5 bg-ligne-forte" />
                Indice sur 100
              </span>
            </p>
            <GraphiqueEvolution evolution={vue.evolution} />
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs tracking-[0.06em] text-muet uppercase">
                  <th scope="col" className="py-1.5 text-left">
                    QCM
                  </th>
                  <th scope="col" className="py-1.5 text-right">
                    Note
                  </th>
                  <th scope="col" className="py-1.5 text-right">
                    Indice
                  </th>
                </tr>
              </thead>
              <tbody>
                {vue.evolution.map((p) => (
                  <tr
                    key={p.participationId}
                    className={`border-t border-ligne-douce ${p.courante ? "font-bold" : ""}`}
                  >
                    <td className="py-2">{p.titre}</td>
                    <td className="py-2 text-right font-code">{formaterNote(p.note)}</td>
                    <td className="py-2 text-right font-code">{p.indice ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <p className="text-[13px] leading-[1.45] text-muet">{MENTION_RAPPORT}</p>
        </div>
      </div>
    </>
  );
}
