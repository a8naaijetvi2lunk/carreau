/** Marque de Carreau : quatre carreaux, dont un coché. Le logo institutionnel arrive au lot 9. */
export function Marque({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 font-titre text-xl font-extrabold tracking-tight ${className}`}
    >
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22">
        <rect x="1" y="1" width="9" height="9" rx="2" className="fill-bleu" />
        <rect x="12" y="1" width="9" height="9" rx="2" className="fill-none stroke-encre" strokeWidth="2" />
        <rect x="1" y="12" width="9" height="9" rx="2" className="fill-none stroke-encre" strokeWidth="2" />
        <rect x="12" y="12" width="9" height="9" rx="2" className="fill-none stroke-encre" strokeWidth="2" />
      </svg>
      Carreau
    </span>
  );
}
