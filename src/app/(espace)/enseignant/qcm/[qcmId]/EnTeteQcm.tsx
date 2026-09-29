import { Alerte, classesBouton, Etiquette } from "@/components/ui";
import { LIBELLES_STATUT } from "@/lib/regles-qcm";
import type { QcmEdite } from "@/modules/qcm";
import { TONS_STATUT } from "../libelles";
import { ActionsStatut } from "./ActionsStatut";
import { LienSansPerte } from "./enregistrement";

/** En-tête de l'éditeur (maquette « Éditeur de QCM ») : fil d'Ariane, titre, statut, aperçu et statuts. */
export function EnTeteQcm({
  qcm,
  numeroCourant,
}: {
  qcm: Pick<QcmEdite, "id" | "titre" | "statut" | "origine">;
  numeroCourant: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <nav aria-label="Fil d’Ariane" className="text-[15px] text-muet">
          <LienSansPerte href="/enseignant/qcm" className="underline">
            QCM
          </LienSansPerte>{" "}
          <span aria-hidden="true">/</span>
        </nav>
        <h1 className="min-w-0 font-titre text-2xl leading-tight font-extrabold tracking-tight md:text-[28px]">
          {qcm.titre}
        </h1>
        <Etiquette ton={TONS_STATUT[qcm.statut]}>{LIBELLES_STATUT[qcm.statut]}</Etiquette>
        {qcm.origine === "mcp" ? <Etiquette ton="bleu">Créé via MCP · à relire</Etiquette> : null}
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <LienSansPerte
          href={`/enseignant/qcm/${qcm.id}/apercu?question=${numeroCourant}`}
          className={classesBouton("secondaire")}
        >
          Aperçu étudiant
        </LienSansPerte>
        <ActionsStatut qcmId={qcm.id} statut={qcm.statut} />
      </div>
      {qcm.statut === "pret" ? (
        <Alerte>Ce QCM est prêt : il est en lecture seule. Repasse-le en brouillon pour le modifier.</Alerte>
      ) : null}
      {qcm.statut === "archive" ? (
        <Alerte>Ce QCM est archivé : il est en lecture seule. Restaure-le pour le modifier.</Alerte>
      ) : null}
    </div>
  );
}
