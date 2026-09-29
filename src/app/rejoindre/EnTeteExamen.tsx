import type { SessionAffichee } from "@/lib/vue-entree";

/** Carte de l'examen rejoint (maquette « Rejoindre ») : titre, classe, enseignant. */
export function EnTeteExamen({ session }: { session: SessionAffichee }) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] border border-ligne bg-carte p-4">
      <p className="text-xs font-bold tracking-[0.08em] text-muet uppercase">Examen</p>
      <p className="text-lg font-bold">{session.titre}</p>
      <p className="text-[15px] text-muet">
        Groupe {session.classe} · {session.enseignant}
      </p>
    </div>
  );
}
