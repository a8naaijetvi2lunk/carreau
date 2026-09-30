import type { Metadata } from "next";
import Link from "next/link";
import { Etiquette, LienBouton } from "@/components/ui";
import { executerPage } from "@/lib/page";
import { LIBELLES_STATUT_SESSION } from "@/lib/regles-session";
import { exigerActeur } from "@/modules/auth";
import { listerSessions } from "@/modules/sessions";
import { libelleQuand, TONS_STATUT_SESSION } from "./sessions/libelles";

export const metadata: Metadata = { title: "Accueil" };

/** Accueil de l'enseignant (maquette « Accueil ») : ses sessions ouvertes, et de quoi en préparer. */
export default async function AccueilEnseignant() {
  const { acteur, sessions } = await executerPage(async () => {
    const acteur = await exigerActeur();
    return { acteur, sessions: await listerSessions(acteur) };
  });
  const ouvertes = sessions.filter((s) => s.statut === "attente" || s.statut === "en_cours").slice(0, 5);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-titre text-4xl leading-[1.05] font-extrabold tracking-tight">
          Bonjour {acteur.prenom}
        </h1>
        <div className="flex flex-wrap gap-2">
          <LienBouton href="/enseignant/sessions" variante="secondaire">
            Nouvelle session
          </LienBouton>
          <LienBouton href="/enseignant/qcm">Nouveau QCM</LienBouton>
        </div>
      </div>
      <section
        aria-labelledby="sessions-ouvertes"
        className="flex max-w-3xl flex-col overflow-hidden rounded-2xl border border-ligne bg-carte"
      >
        <h2 id="sessions-ouvertes" className="px-5 pt-4 pb-3 text-lg font-bold">
          Sessions ouvertes
        </h2>
        {ouvertes.length === 0 ? (
          <p className="px-5 pb-4 text-[15px] text-encre-2">
            Aucune session ouverte. Écris un QCM et marque-le comme prêt, importe ta classe, puis crée une
            session.
          </p>
        ) : (
          <ul aria-label="Sessions ouvertes">
            {ouvertes.map((s) => (
              <li key={s.id} className="border-t border-ligne-douce">
                <Link
                  href={`/enseignant/sessions/${s.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-encre hover:bg-papier"
                >
                  <strong className="min-w-0 truncate">
                    {s.titre} · {s.classe}
                  </strong>
                  <Etiquette ton={TONS_STATUT_SESSION[s.statut]}>
                    {LIBELLES_STATUT_SESSION[s.statut]}
                  </Etiquette>
                  {s.type === "rattrapage" ? <Etiquette>Rattrapage</Etiquette> : null}
                  <span className="text-sm text-muet">{libelleQuand(s)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/enseignant/sessions"
          className="flex min-h-11 items-center px-5 text-sm font-bold text-bleu underline"
        >
          Toutes les sessions
        </Link>
      </section>
    </>
  );
}
