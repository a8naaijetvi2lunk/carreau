import type { Metadata } from "next";
import { executerPage } from "@/lib/page";
import { exigerActeur } from "@/modules/auth";
import { listerSessions, optionsNouvelleSession } from "@/modules/sessions";
import { FormulaireNouvelleSession } from "./FormulaireNouvelleSession";
import { ListeSessions } from "./ListeSessions";

export const metadata: Metadata = { title: "Sessions" };

export default async function PageSessions(props: PageProps<"/enseignant/sessions">) {
  const { qcm } = await props.searchParams;
  const { sessions, options } = await executerPage(async () => {
    const acteur = await exigerActeur();
    return { sessions: await listerSessions(acteur), options: await optionsNouvelleSession(acteur) };
  });
  // « Lancer une session » depuis un QCM prêt : ce QCM est présélectionné (décision D18).
  const qcmInitial =
    typeof qcm === "string" && options.qcm.some((q) => q.id === qcm) ? qcm : (options.qcm[0]?.id ?? "");
  return (
    <>
      <h1 className="font-titre text-4xl leading-[1.05] font-extrabold tracking-tight">Sessions</h1>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <ListeSessions sessions={sessions} />
        <section
          aria-labelledby="nouvelle-session"
          className="flex flex-col gap-3 rounded-2xl border border-ligne bg-carte p-5"
        >
          <h2 id="nouvelle-session" className="text-lg font-bold">
            Nouvelle session
          </h2>
          <FormulaireNouvelleSession options={options} qcmInitial={qcmInitial} />
          <p className="text-[13px] text-muet">
            Les étudiants rejoignent la salle d’attente avec le QR code projeté ; l’examen démarre pour tous
            quand tu le décides.
          </p>
        </section>
      </div>
    </>
  );
}
