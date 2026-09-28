import Link from "next/link";
import type { ComponentProps } from "react";

type Variante = "primaire" | "secondaire";

// Cible tactile de 44 px au minimum (min-h-11), comme dans les maquettes.
const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] px-4 text-[15px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const VARIANTES: Record<Variante, string> = {
  primaire: "bg-bleu text-blanc hover:bg-bleu-fonce",
  secondaire: "border border-ligne-forte bg-carte text-encre hover:bg-papier",
};

export function Bouton({
  variante = "primaire",
  className = "",
  type = "button",
  ...props
}: ComponentProps<"button"> & { variante?: Variante }) {
  return <button type={type} className={`${BASE} ${VARIANTES[variante]} ${className}`} {...props} />;
}

export function LienBouton({
  variante = "primaire",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link className={`${BASE} ${VARIANTES[variante]} ${className}`} {...props} />;
}
