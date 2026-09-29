import type { ReactNode } from "react";

type Ton = "sombre" | "bleu" | "neutre";

const TONS: Record<Ton, string> = {
  sombre: "bg-encre text-carte",
  bleu: "bg-bleu-pale text-bleu-fonce",
  neutre: "bg-ligne-douce text-encre-2",
};

export function Etiquette({ ton = "neutre", children }: { ton?: Ton; children: ReactNode }) {
  return (
    <span
      className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-[13px] font-bold ${TONS[ton]}`}
    >
      {children}
    </span>
  );
}
