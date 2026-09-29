import Link from "next/link";
import { Etiquette } from "@/components/ui";
import { LIBELLES_STATUT_SESSION } from "@/lib/regles-session";
import { pluriel } from "@/lib/textes";
import type { SessionResume } from "@/modules/sessions";
import { libelleQuand, TONS_STATUT_SESSION } from "./libelles";

function Tableau({
  id,
  titre,
  sessions,
  vide,
}: {
  id: string;
  titre: string;
  sessions: SessionResume[];
  vide: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col overflow-hidden rounded-2xl border border-ligne bg-carte"
    >
      <h2 id={id} className="px-5 pt-4 pb-3 text-lg font-bold">
        {titre}
      </h2>
      {sessions.length === 0 ? (
        <p className="px-5 pb-4 text-[15px] text-muet">{vide}</p>
      ) : (
        <ul aria-label={titre}>
          {sessions.map((s) => (
            <li key={s.id} className="border-t border-ligne-douce">
              <Link
                href={`/enseignant/sessions/${s.id}`}
                className="grid gap-1.5 px-5 py-3 text-encre hover:bg-papier md:grid-cols-[minmax(0,1fr)_9rem_12rem_7rem] md:items-center md:gap-4"
              >
                <span className="flex min-w-0 flex-col">
                  <strong className="max-w-full truncate text-base">{s.titre}</strong>
                  <span className="text-sm text-muet">{s.classe}</span>
                </span>
                <span>
                  <Etiquette ton={TONS_STATUT_SESSION[s.statut]}>
                    {LIBELLES_STATUT_SESSION[s.statut]}
                  </Etiquette>
                </span>
                <span className="text-sm text-muet">{libelleQuand(s)}</span>
                <span className="font-code text-sm">
                  {s.participants} / {pluriel(s.effectif, "étudiant", "étudiants")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Sessions de l'enseignant (décision D18) : à venir et en cours, puis passées. */
export function ListeSessions({ sessions }: { sessions: SessionResume[] }) {
  const ouvertes = sessions.filter((s) => s.statut === "attente" || s.statut === "en_cours");
  const passees = sessions.filter((s) => s.statut === "terminee" || s.statut === "annulee");
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Tableau
        id="sessions-ouvertes"
        titre="À venir et en cours"
        sessions={ouvertes}
        vide="Aucune session ouverte : crée-en une avec le formulaire."
      />
      {passees.length > 0 ? (
        <Tableau id="sessions-passees" titre="Passées" sessions={passees} vide="" />
      ) : null}
    </div>
  );
}
