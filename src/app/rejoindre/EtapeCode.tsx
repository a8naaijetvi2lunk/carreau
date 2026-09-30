"use client";

import { useState, type FormEvent } from "react";
import { Bouton, Champ } from "@/components/ui";
import { ScannerQr } from "./ScannerQr";

/**
 * Entrée dans un examen (spec §6.1) : scanner du QR code projeté (lot 9) ou saisie du code affiché au
 * tableau. Le code lu part exactement comme une saisie.
 */
export function EtapeCode({ onCode }: { onCode: (code: string) => Promise<void> }) {
  const [code, setCode] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [scanner, setScanner] = useState(false);

  async function soumettre(valeur: string): Promise<void> {
    setEnCours(true);
    try {
      await onCode(valeur);
    } finally {
      setEnCours(false);
    }
  }

  function envoyer(evenement: FormEvent<HTMLFormElement>): void {
    evenement.preventDefault();
    void soumettre(code);
  }

  function lu(valeur: string): void {
    setScanner(false);
    setCode(valeur);
    void soumettre(valeur);
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="font-titre text-[34px] leading-[1.05] font-extrabold tracking-tight">
          Rejoindre un examen
        </h1>
        <p className="text-base text-encre-2">
          Scanne le QR code projeté, ou saisis le code affiché au tableau.
        </p>
      </div>
      {scanner ? (
        <ScannerQr onCode={lu} onFermer={() => setScanner(false)} />
      ) : (
        <>
          <Bouton
            variante="secondaire"
            disabled={enCours}
            onClick={() => setScanner(true)}
            className="min-h-14 text-[17px]"
          >
            Scanner le QR code
          </Bouton>
          <form onSubmit={envoyer} className="flex flex-col gap-3" noValidate>
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
        </>
      )}
    </section>
  );
}
