/**
 * Contrôle d'un classeur XLSX avant sa lecture (décision D8 du plan du lot 2) : une archive ZIP
 * de quelques Kio peut se décompresser en plusieurs Go et saturer la mémoire du serveur pendant un
 * examen. On mesure la taille décompressée RÉELLE (pas celle que déclare l'archive) en
 * décompressant par tranches de 1 Kio, et on abandonne dès le dépassement : la mémoire reste bornée.
 */
import "server-only";
import { Unzip, UnzipInflate } from "fflate";
import { erreurs } from "@/lib/erreurs";
import { MAX_DECOMPRESSE_OCTETS, MAX_ENTREES_ARCHIVE, MESSAGES_IMPORT } from "./messages";

/** 1 Kio compressé produit au plus ~1 Mio décompressé (taux maximal de deflate ≈ 1 : 1 032). */
const TRANCHE_OCTETS = 1024;

export function verifierArchive(octets: Uint8Array): void {
  let total = 0;
  let entrees = 0;
  // Objet plutôt que variable simple : TypeScript ne re-largit pas le type d'une variable
  // capturée réassignée uniquement dans des fonctions appelées (ici les rappels de fflate), et
  // signale alors à tort les comparaisons ci-dessous comme sans recouvrement (TS2367).
  const etat: { valeur: "ok" | "trop_volumineuse" | "illisible" } = { valeur: "ok" };
  const archive = new Unzip((fichier) => {
    entrees += 1;
    if (entrees > MAX_ENTREES_ARCHIVE) {
      etat.valeur = "trop_volumineuse";
      return;
    }
    fichier.ondata = (erreur, morceau) => {
      if (erreur) {
        etat.valeur = "illisible";
        return;
      }
      total += morceau.length;
      if (total > MAX_DECOMPRESSE_OCTETS) etat.valeur = "trop_volumineuse";
    };
    fichier.start();
  });
  archive.register(UnzipInflate);
  try {
    for (let debut = 0; debut < octets.length && etat.valeur === "ok"; debut += TRANCHE_OCTETS) {
      archive.push(octets.subarray(debut, debut + TRANCHE_OCTETS), debut + TRANCHE_OCTETS >= octets.length);
    }
  } catch {
    // Archive tronquée ou corrompue, méthode de compression inconnue.
    etat.valeur = "illisible";
  }
  if (etat.valeur === "trop_volumineuse") throw erreurs.validation(MESSAGES_IMPORT.archiveTropVolumineuse);
  if (etat.valeur === "illisible") throw erreurs.validation(MESSAGES_IMPORT.illisible);
}
