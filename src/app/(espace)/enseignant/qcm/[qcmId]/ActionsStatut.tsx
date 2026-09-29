"use client";

import { useState } from "react";
import { Bouton } from "@/components/ui";
import type { ResultatAction } from "@/lib/action";
import type { StatutQcm } from "@/lib/regles-qcm";
import {
  archiverQcmAction,
  marquerPretAction,
  repasserEnBrouillonAction,
  restaurerQcmAction,
} from "../actions";
import { useRegistreVidanges } from "./enregistrement";

type Refus = { message: string; problemes: string[] };

/** `details.problemes` d'un refus de passage en « prêt » (décision D5). */
function problemesDe(details: unknown): string[] {
  if (typeof details !== "object" || details === null) return [];
  const problemes = (details as { problemes?: unknown }).problemes;
  return Array.isArray(problemes) ? problemes.filter((p): p is string => typeof p === "string") : [];
}

/** Boutons de statut du QCM ; ils attendent l'enregistrement de la question en cours (décision D8). */
export function ActionsStatut({ qcmId, statut }: { qcmId: string; statut: StatutQcm }) {
  const registre = useRegistreVidanges();
  const [enCours, setEnCours] = useState(false);
  const [refus, setRefus] = useState<Refus | null>(null);

  async function agir(action: (id: string) => Promise<ResultatAction<null>>): Promise<void> {
    setRefus(null);
    setEnCours(true);
    try {
      if (registre && !(await registre.toutVidanger())) return;
      const resultat = await action(qcmId);
      if (!resultat.ok)
        setRefus({ message: resultat.erreur.message, problemes: problemesDe(resultat.erreur.details) });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {statut === "brouillon" ? (
          <Bouton disabled={enCours} onClick={() => void agir(marquerPretAction)}>
            Marquer comme prêt
          </Bouton>
        ) : null}
        {statut === "pret" ? (
          <Bouton
            variante="secondaire"
            disabled={enCours}
            onClick={() => void agir(repasserEnBrouillonAction)}
          >
            Repasser en brouillon
          </Bouton>
        ) : null}
        {statut === "archive" ? (
          <Bouton variante="secondaire" disabled={enCours} onClick={() => void agir(restaurerQcmAction)}>
            Restaurer
          </Bouton>
        ) : (
          <Bouton variante="secondaire" disabled={enCours} onClick={() => void agir(archiverQcmAction)}>
            Archiver
          </Bouton>
        )}
      </div>
      {refus ? (
        <div
          role="alert"
          className="flex flex-col gap-1.5 rounded-xl border border-orange bg-orange-pale px-4 py-3 text-orange-fonce"
        >
          <p className="font-bold">{refus.message}</p>
          {refus.problemes.length > 0 ? (
            <ul aria-label="Points à corriger" className="list-disc pl-5 text-sm">
              {refus.problemes.map((probleme) => (
                <li key={probleme}>{probleme}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
