import type { SessionAffichee } from "@/lib/vue-entree";
import { EnTeteExamen } from "./EnTeteExamen";

/** Écran final : téléphone remplacé par un autre, session annulée ou terminée. */
export function EtapeMessage({
  session,
  titre,
  texte,
}: {
  session: SessionAffichee;
  titre: string;
  texte: string;
}) {
  return (
    <section className="flex flex-1 flex-col gap-5">
      <EnTeteExamen session={session} />
      <h1 className="font-titre text-[30px] leading-[1.08] font-extrabold tracking-tight">{titre}</h1>
      <p className="text-base text-encre-2">{texte}</p>
    </section>
  );
}
