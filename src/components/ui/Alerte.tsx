import type { ReactNode } from "react";

type Ton = "erreur" | "succes" | "info";

const TONS: Record<Ton, string> = {
  erreur: "border-orange bg-orange-pale text-orange-fonce",
  succes: "border-bleu bg-bleu-pale text-bleu-fonce",
  info: "border-ligne bg-carte text-encre-2",
};

/** Message annoncé aux lecteurs d'écran : `alert` pour une erreur, `status` sinon. */
export function Alerte({ ton = "info", children }: { ton?: Ton; children: ReactNode }) {
  return (
    <div
      role={ton === "erreur" ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-[15px] leading-snug ${TONS[ton]}`}
    >
      {children}
    </div>
  );
}
