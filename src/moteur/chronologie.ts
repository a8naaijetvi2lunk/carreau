/**
 * Chronologie du rapport étudiant (spec §8.4 ; décision D10 du plan du lot 7), fonction pure : repères
 * du début et de la fin, faits consolidés (sorties avec leur retour, pertes de focus, coupures,
 * ponctuels) et réponses, du plus ancien au plus récent. Les index sont les rangs de l'étudiant ;
 * l'appelant les convertit en numéros du QCM (D7).
 */
import type { OrigineReponse } from "@/lib/regles-examen";
import { TEXTES_CHRONOLOGIE } from "@/lib/regles-resultats";
import { PONDERATION_V1, type Ponderation } from "@/lib/regles-surveillance";
import type { SorteChronologie } from "@/lib/vue-resultats";
import type { Consolidation, Intervalle } from "./indice";

/** Réponse close d'un passage : rang de l'étudiant (0…), heure, origine. */
export type ReponseDatee = { index: number; le: Date; origine: OrigineReponse };

export type EntreeBrute = {
  le: Date;
  index: number | null;
  texte: string;
  dureeMs: number | null;
  sorte: SorteChronologie;
};

export type PassageRaconte = {
  demarreLe: Date;
  termineeLe: Date;
  consolidation: Consolidation;
  reponses: readonly ReponseDatee[];
  /** Réponses validées non vides. */
  repondues: number;
  total: number;
};

/** Début d'abord et fin en dernier à heure égale ; le reste garde l'ordre d'ajout (tri stable). */
const RANG_DEBUT = 0;
const RANG_FAIT = 1;
const RANG_FIN = 2;

/** Sortie retenue par la règle de la réponse rapide (D4-bis du lot 6) : la plus récente avant `le`. */
function retourAvant(sorties: readonly Intervalle[], le: Date, p: Ponderation): Intervalle | null {
  let trouvee: Intervalle | null = null;
  for (const s of sorties) {
    if (s.dureeMs < p.reponseRapideSortieMinMs) continue;
    const ecart = le.getTime() - s.fin.getTime();
    if (ecart < 0 || ecart > p.reponseRapideDelaiMs) continue;
    if (trouvee === null || s.fin.getTime() > trouvee.fin.getTime()) trouvee = s;
  }
  return trouvee;
}

export function chronologie(passage: PassageRaconte, p: Ponderation = PONDERATION_V1): EntreeBrute[] {
  const c = passage.consolidation;
  const entrees: (EntreeBrute & { rang: number })[] = [];
  const ajouter = (entree: EntreeBrute, rang = RANG_FAIT): void => {
    entrees.push({ ...entree, rang });
  };
  const ponctuel = (le: Date, index: number | null, texte: string, sorte: SorteChronologie): void => {
    ajouter({ le, index, texte, dureeMs: null, sorte });
  };
  ajouter(
    { le: passage.demarreLe, index: null, texte: TEXTES_CHRONOLOGIE.debut, dureeMs: null, sorte: "repere" },
    RANG_DEBUT,
  );
  for (const s of c.sorties) {
    ajouter({
      le: s.debut,
      index: s.questionIndex,
      texte: TEXTES_CHRONOLOGIE.sortie,
      dureeMs: s.dureeMs,
      sorte: "notable",
    });
    ponctuel(s.fin, s.questionIndex, TEXTES_CHRONOLOGIE.retour, "mineur");
  }
  for (const f of c.focus.filter((x) => x.dureeMs >= p.focusMinMs)) {
    ajouter({
      le: f.debut,
      index: f.questionIndex,
      texte: TEXTES_CHRONOLOGIE.focus,
      dureeMs: f.dureeMs,
      sorte: "mineur",
    });
  }
  for (const x of c.coupures) {
    ajouter({
      le: x.debut,
      index: x.questionIndex,
      texte: TEXTES_CHRONOLOGIE.coupure,
      dureeMs: x.dureeMs,
      sorte: "mineur",
    });
  }
  for (const x of c.pressePapiers)
    ponctuel(x.le, x.questionIndex, TEXTES_CHRONOLOGIE.pressePapiers, "notable");
  for (const x of c.ecranPartage) ponctuel(x.le, x.questionIndex, TEXTES_CHRONOLOGIE.ecranPartage, "notable");
  for (const x of c.secondAppareil)
    ponctuel(x.le, x.questionIndex, TEXTES_CHRONOLOGIE.secondAppareil, "notable");
  for (const x of c.rechargements) ponctuel(x.le, x.questionIndex, TEXTES_CHRONOLOGIE.rechargement, "mineur");
  for (const r of passage.reponses) {
    if (r.origine === "fin") continue;
    if (r.origine === "echeance") {
      ponctuel(r.le, r.index, TEXTES_CHRONOLOGIE.echeance, "mineur");
      continue;
    }
    const retour = retourAvant(c.sorties, r.le, p);
    if (retour === null) ponctuel(r.le, r.index, TEXTES_CHRONOLOGIE.reponse, "mineur");
    else {
      const secondes = Math.round((r.le.getTime() - retour.fin.getTime()) / 1000);
      ponctuel(r.le, r.index, TEXTES_CHRONOLOGIE.reponseRapide(secondes), "notable");
    }
  }
  ajouter(
    {
      le: passage.termineeLe,
      index: null,
      texte: TEXTES_CHRONOLOGIE.fin(passage.repondues, passage.total),
      dureeMs: null,
      sorte: "repere",
    },
    RANG_FIN,
  );
  return entrees
    .sort((x, y) => x.le.getTime() - y.le.getTime() || x.rang - y.rang)
    .map(({ le, index, texte, dureeMs, sorte }) => ({ le, index, texte, dureeMs, sorte }));
}
