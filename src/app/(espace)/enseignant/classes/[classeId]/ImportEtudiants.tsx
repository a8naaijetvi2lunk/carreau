"use client";

import { useActionState, useState } from "react";
import { Alerte, Bouton, Etiquette } from "@/components/ui";
import type { ResultatAction } from "@/lib/action";
import type { ApercuImport, BilanImport, StatutLigneImport } from "@/modules/classes";
import { pluriel } from "@/lib/textes";
import { analyserImportAction, importerEtudiantsAction } from "../actions";

type EtatImport =
  | { etape: "apercu"; resultat: ResultatAction<ApercuImport> }
  | { etape: "bilan"; resultat: ResultatAction<BilanImport> }
  | null;

const STATUTS: Record<StatutLigneImport, { libelle: string; ton: "bleu" | "sombre" | "neutre" }> = {
  nouveau: { libelle: "Nouveau", ton: "bleu" },
  tiers_temps_modifie: { libelle: "Tiers-temps modifié", ton: "sombre" },
  deja_present: { libelle: "Déjà présent", ton: "neutre" },
};

const ECHEC_ENVOI = "L’envoi a échoué : vérifie ta connexion et la taille du fichier, puis réessaie.";

function echec(message: string): ResultatAction<never> {
  return { ok: false, erreur: { code: "VALIDATION", message } };
}

function resumeApercu(apercu: ApercuImport): string {
  const parties = [pluriel(apercu.ajouts, "étudiant à ajouter", "étudiants à ajouter")];
  if (apercu.misesAJour > 0) parties.push(`${apercu.misesAJour} tiers-temps à mettre à jour`);
  if (apercu.dejaPresents > 0) parties.push(pluriel(apercu.dejaPresents, "déjà présent", "déjà présents"));
  if (apercu.rejets.length > 0)
    parties.push(pluriel(apercu.rejets.length, "ligne rejetée", "lignes rejetées"));
  return parties.join(" · ");
}

function resumeBilan(bilan: BilanImport): string {
  const parties = [pluriel(bilan.ajoutes, "étudiant ajouté", "étudiants ajoutés")];
  if (bilan.misAJour > 0) parties.push(`${bilan.misAJour} tiers-temps mis à jour`);
  if (bilan.inchanges > 0) parties.push(pluriel(bilan.inchanges, "déjà présent", "déjà présents"));
  return `Import enregistré : ${parties.join(", ")}.`;
}

function IconeFichier() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-bleu"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </svg>
  );
}

function Apercu({
  apercu,
  classeId,
  action,
  enCours,
}: {
  apercu: ApercuImport;
  classeId: string;
  action: (formulaire: FormData) => void;
  enCours: boolean;
}) {
  const lignes = JSON.stringify(
    apercu.lignes.map(({ nom, prenom, tiersTemps }) => ({ nom, prenom, tiersTemps })),
  );
  const aEnregistrer = apercu.ajouts + apercu.misesAJour;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-ligne bg-carte p-4">
      <h4 className="text-base font-bold">Aperçu</h4>
      <p className="text-[15px]">{resumeApercu(apercu)}</p>
      {apercu.colonneTiersTemps ? null : (
        <p className="text-[13px] text-muet">
          Pas de colonne Tiers-temps : les nouveaux étudiants n’en ont pas, et celui des étudiants déjà
          présents ne change pas.
        </p>
      )}
      {apercu.rejets.length > 0 ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-orange bg-orange-pale p-3 text-orange-fonce">
          <p className="font-bold">
            {pluriel(apercu.rejets.length, "ligne rejetée", "lignes rejetées")}, qui ne seront pas importées :
          </p>
          <ul aria-label="Lignes rejetées" className="flex flex-col gap-1 text-sm">
            {apercu.rejets.map((rejet) => (
              <li key={rejet.numero}>
                Ligne {rejet.numero} : {rejet.motif}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {apercu.lignes.length > 0 ? (
        <div className="max-h-96 overflow-auto rounded-lg border border-ligne-douce">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Lignes valides de la liste</caption>
            <thead className="bg-papier text-xs tracking-[0.06em] text-muet uppercase">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Ligne
                </th>
                <th scope="col" className="px-3 py-2">
                  Nom
                </th>
                <th scope="col" className="px-3 py-2">
                  Prénom
                </th>
                <th scope="col" className="px-3 py-2">
                  Tiers-temps
                </th>
                <th scope="col" className="px-3 py-2">
                  Statut
                </th>
              </tr>
            </thead>
            <tbody>
              {apercu.lignes.map((ligne) => (
                <tr key={ligne.numero} className="border-t border-ligne-douce">
                  <td className="px-3 py-2 text-muet">{ligne.numero}</td>
                  <td className="px-3 py-2 font-bold">{ligne.nom}</td>
                  <td className="px-3 py-2">{ligne.prenom}</td>
                  <td className="px-3 py-2">
                    {ligne.tiersTemps === null ? "—" : ligne.tiersTemps ? "Oui" : "Non"}
                  </td>
                  <td className="px-3 py-2">
                    <Etiquette ton={STATUTS[ligne.statut].ton}>{STATUTS[ligne.statut].libelle}</Etiquette>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {aEnregistrer > 0 ? (
        <form action={action}>
          <input type="hidden" name="etape" value="importer" />
          <input type="hidden" name="classeId" value={classeId} />
          <input type="hidden" name="lignes" value={lignes} />
          <Bouton type="submit" disabled={enCours}>
            {apercu.misesAJour === 0
              ? `Importer ${pluriel(apercu.ajouts, "étudiant", "étudiants")}`
              : "Enregistrer l’import"}
          </Bouton>
        </form>
      ) : (
        <p className="text-[15px] text-encre-2">
          Rien à enregistrer : ces étudiants sont déjà dans la classe.
        </p>
      )}
    </div>
  );
}

/**
 * Import d'une liste (maquette « Classes », zone de dépôt) : fichier CSV ou Excel, ou liste collée,
 * puis aperçu (lignes valides, rejets motivés) et confirmation. La confirmation renvoie les
 * lignes de l'aperçu, le serveur les revalide (décision D13).
 */
export function ImportEtudiants({
  classeId,
  tailleMaxOctets,
  messageTropGros,
}: {
  classeId: string;
  tailleMaxOctets: number;
  messageTropGros: string;
}) {
  const [source, setSource] = useState<"fichier" | "texte">("fichier");
  const [texte, setTexte] = useState("");
  const [etat, agir, enCours] = useActionState(
    async (_etat: EtatImport, formulaire: FormData): Promise<EtatImport> => {
      try {
        if (formulaire.get("etape") === "importer") {
          return { etape: "bilan", resultat: await importerEtudiantsAction(formulaire) };
        }
        const fichier = formulaire.get("fichier");
        // Au-delà de 1 Mo, Next refuserait le corps avant le code serveur : on s'arrête ici.
        if (fichier instanceof File && fichier.size > tailleMaxOctets) {
          return { etape: "apercu", resultat: echec(messageTropGros) };
        }
        return { etape: "apercu", resultat: await analyserImportAction(formulaire) };
      } catch {
        return {
          etape: "apercu",
          resultat: { ok: false, erreur: { code: "INTERNE", message: ECHEC_ENVOI } },
        };
      }
    },
    null,
  );
  const apercu = etat?.etape === "apercu" && etat.resultat.ok ? etat.resultat.donnees : null;

  return (
    <section aria-labelledby="importer-liste" className="flex flex-col gap-3">
      <h3 id="importer-liste" className="text-base font-bold">
        Importer une liste
      </h3>
      <div role="group" aria-label="Source de la liste" className="flex flex-wrap gap-1.5">
        {(["fichier", "texte"] as const).map((valeur) => (
          <button
            key={valeur}
            type="button"
            aria-pressed={source === valeur}
            onClick={() => setSource(valeur)}
            className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm ${
              source === valeur ? "bg-encre font-bold text-carte" : "border border-ligne bg-carte"
            }`}
          >
            {valeur === "fichier" ? "Fichier CSV ou Excel" : "Coller depuis un tableur"}
          </button>
        ))}
      </div>
      <form action={agir} className="flex flex-col gap-3">
        <input type="hidden" name="etape" value="apercu" />
        <input type="hidden" name="classeId" value={classeId} />
        <input type="hidden" name="source" value={source} />
        {source === "fichier" ? (
          <label className="flex flex-col gap-3 rounded-xl border-2 border-dashed border-ligne-forte bg-papier p-4 md:flex-row md:items-center">
            <IconeFichier />
            <span className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[15px] font-bold">Glisse un fichier CSV ou Excel ici, ou choisis-le</span>
              <span className="text-[13px] text-muet">
                Colonnes reconnues : Nom, Prénom, Tiers-temps (facultatif). Tu vérifies l’aperçu avant
                d’enregistrer.
              </span>
              <input
                type="file"
                name="fichier"
                aria-label="Fichier de la liste"
                accept=".csv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="max-w-full text-sm"
              />
            </span>
          </label>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="texte-liste" className="text-[13px] font-bold text-encre-2">
              Liste collée depuis ton tableur
            </label>
            <textarea
              id="texte-liste"
              name="texte"
              rows={8}
              value={texte}
              onChange={(evenement) => setTexte(evenement.target.value)}
              placeholder={"Nom\tPrénom\tTiers-temps\nDUPONT\tLéa\tnon"}
              aria-describedby="texte-liste-aide"
              className="w-full rounded-[10px] border border-ligne bg-blanc px-3 py-2 font-code text-sm"
            />
            <p id="texte-liste-aide" className="text-[13px] text-muet">
              Sélectionne les colonnes dans ton tableur, ligne des titres comprise, puis colle-les ici.
            </p>
          </div>
        )}
        <Bouton type="submit" variante="secondaire" disabled={enCours} className="self-start">
          Voir l’aperçu
        </Bouton>
      </form>
      {etat && !etat.resultat.ok ? <Alerte ton="erreur">{etat.resultat.erreur.message}</Alerte> : null}
      {etat?.etape === "bilan" && etat.resultat.ok ? (
        <Alerte ton="succes">{resumeBilan(etat.resultat.donnees)}</Alerte>
      ) : null}
      {apercu ? <Apercu apercu={apercu} classeId={classeId} action={agir} enCours={enCours} /> : null}
    </section>
  );
}
