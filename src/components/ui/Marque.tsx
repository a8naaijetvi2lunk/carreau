import Image from "next/image";

/** Marque de Carreau : l'icône institutionnelle (lot 9, générée par Codex, choisie par Yves) et le nom. */
export function Marque({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 font-titre text-xl font-extrabold tracking-tight ${className}`}
    >
      <Image src="/marque.png" alt="" width={24} height={24} className="rounded-md" />
      Carreau
    </span>
  );
}
