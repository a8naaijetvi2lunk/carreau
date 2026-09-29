import type { ComponentProps } from "react";

type Proprietes = { id: string; libelle: string; aide?: string; erreur?: string };

const CONTROLE = "min-h-11 w-full rounded-[10px] border bg-blanc px-3 text-[15px] text-encre";

function descriptions(id: string, aide?: string, erreur?: string): string | undefined {
  const ids = [aide ? `${id}-aide` : null, erreur ? `${id}-erreur` : null].filter(
    (valeur) => valeur !== null,
  );
  return ids.length > 0 ? ids.join(" ") : undefined;
}

function AideEtErreur({ id, aide, erreur }: { id: string; aide?: string; erreur?: string }) {
  return (
    <>
      {aide ? (
        <p id={`${id}-aide`} className="text-[13px] text-muet">
          {aide}
        </p>
      ) : null}
      {erreur ? (
        <p id={`${id}-erreur`} className="text-[13px] font-bold text-orange-fonce">
          {erreur}
        </p>
      ) : null}
    </>
  );
}

/** Champ de saisie avec son libellé, une aide et une erreur reliées par aria-describedby. */
export function Champ({
  id,
  libelle,
  aide,
  erreur,
  className = "",
  ...props
}: Proprietes & Omit<ComponentProps<"input">, "id">) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-bold text-encre-2">
        {libelle}
      </label>
      <input
        id={id}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={descriptions(id, aide, erreur)}
        className={`${CONTROLE} ${erreur ? "border-orange" : "border-ligne"} ${className}`}
        {...props}
      />
      <AideEtErreur id={id} aide={aide} erreur={erreur} />
    </div>
  );
}

/** Liste de choix avec son libellé. */
export function Selection({
  id,
  libelle,
  aide,
  erreur,
  options,
  className = "",
  ...props
}: Proprietes & { options: readonly { valeur: string; libelle: string }[] } & Omit<
    ComponentProps<"select">,
    "id"
  >) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-bold text-encre-2">
        {libelle}
      </label>
      <select
        id={id}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={descriptions(id, aide, erreur)}
        className={`${CONTROLE} ${erreur ? "border-orange" : "border-ligne"} ${className}`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.valeur} value={option.valeur}>
            {option.libelle}
          </option>
        ))}
      </select>
      <AideEtErreur id={id} aide={aide} erreur={erreur} />
    </div>
  );
}
