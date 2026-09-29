"use client";

import { useState, type FormEvent } from "react";
import { Bouton, Champ } from "@/components/ui";

/** Saisie du code affiché au tableau (spec §6.1), pour qui n'a pas scanné le QR code. */
export function EtapeCode({ onCode }: { onCode: (code: string) => Promise<void> }) {
  const [code, setCode] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function envoyer(evenement: FormEvent<HTMLFormElement>): Promise<void> {
    evenement.preventDefault();
    setEnCours(true);
    try {
      await onCode(code);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="font-titre text-[34px] leading-[1.05] font-extrabold tracking-tight">
          Rejoindre un examen
        </h1>
        <p className="text-base text-encre-2">
          Scanne le QR code projeté avec l’appareil photo de ton téléphone, ou saisis le code affiché au
          tableau.
        </p>
      </div>
      <form onSubmit={(evenement) => void envoyer(evenement)} className="flex flex-col gap-3" noValidate>
        <Champ
          id="code-session"
          libelle="Code de la session"
          value={code}
          onChange={(evenement) => setCode(evenement.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={12}
          placeholder="K7M 4QP"
          className="font-code text-xl tracking-[0.08em]"
        />
        <Bouton type="submit" disabled={enCours || code.trim() === ""} className="min-h-14 text-[17px]">
          Rejoindre
        </Bouton>
      </form>
    </section>
  );
}
