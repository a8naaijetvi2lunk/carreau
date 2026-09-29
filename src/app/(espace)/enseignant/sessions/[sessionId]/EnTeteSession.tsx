import Link from "next/link";
import { formaterDateCourte } from "@/lib/dates";
import { pluriel } from "@/lib/textes";
import type { SessionDetaillee } from "@/modules/sessions";

/** En-tête de la page de pilotage : fil d'Ariane, QCM et classe, créneau, résumé de l'examen. */
export function EnTeteSession({ session }: { session: SessionDetaillee }) {
  const { examen } = session;
  return (
    <div className="flex flex-col gap-2">
      <nav aria-label="Fil d’Ariane" className="text-[15px] text-muet">
        <Link href="/enseignant/sessions" className="underline">
          Sessions
        </Link>{" "}
        <span aria-hidden="true">/</span>
      </nav>
      <h1 className="font-titre text-2xl leading-tight font-extrabold tracking-tight md:text-[28px]">
        {session.titre} · {session.classe}
      </h1>
      <p className="text-[15px] text-encre-2">
        {pluriel(examen.questions, "question", "questions")} · {examen.duree} · Barème : {examen.bareme}
        {session.creneauPrevuLe ? ` · Prévue le ${formaterDateCourte(session.creneauPrevuLe)}` : ""}
      </p>
      <p className="text-sm text-muet">
        Note {session.noteVisible ? "visible" : "masquée"} et correction{" "}
        {session.correctionVisible ? "visible" : "masquée"} pour les étudiants à la fin de l’examen.
      </p>
    </div>
  );
}
