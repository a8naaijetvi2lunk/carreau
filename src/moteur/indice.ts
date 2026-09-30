/**
 * Indice de suspicion (spec §8.3 et §8.4 ; décisions D4 à D6 et D4-bis du plan du lot 6), fonctions
 * pures. Les durées viennent des heures de réception du serveur ; le téléphone ne donne que la nature
 * de ce qu'il observe. L'indice est recalculable à tout moment à partir des événements bruts.
 */
import {
  FENETRE_EXPLICATION_MS,
  INTERVALLE_MIN_MS,
  PONDERATION_V1,
  SIGNAUX,
  type Fait,
  type LigneIndice,
  type Ponderation,
  type Signal,
} from "@/lib/regles-surveillance";

/** Ligne de la table `evenement`, telle que le moteur la lit. */
export type EvenementBrut = {
  type: string;
  recuLe: Date;
  dureeMs: number | null;
  questionIndex: number | null;
  chargement: string | null;
  sequence: number | null;
};

export type Intervalle = { debut: Date; fin: Date; dureeMs: number; questionIndex: number | null };
export type Ponctuel = { le: Date; questionIndex: number | null };

export type Consolidation = {
  /** Sorties de page et silences comptés comme sorties (masquée, ou sans explication). */
  sorties: Intervalle[];
  /** Coupures réseau déclarées, sans page masquée : 0 point. */
  coupures: Intervalle[];
  /** Pertes de focus hors sortie (le seuil de 2 s est appliqué par la pondération). */
  focus: Intervalle[];
  pressePapiers: Ponctuel[];
  ecranPartage: Ponctuel[];
  secondAppareil: Ponctuel[];
  rechargements: Ponctuel[];
};

export type Indice = { valeur: number; version: number; detail: LigneIndice[] };

const TYPES_PRESSE_PAPIERS = new Set(["copie", "coupe", "colle"]);
const TYPES_SERVEUR = new Set(["silence", "second_appareil"]);

function chevauche(a: Intervalle, b: Intervalle): boolean {
  return a.debut.getTime() < b.fin.getTime() && b.debut.getTime() < a.fin.getTime();
}

function parFin(a: Intervalle, b: Intervalle): number {
  return a.fin.getTime() - b.fin.getTime();
}

/** Intervalle d'un événement d'ouverture à `fin` ; moins de 1 s, il est ignoré (événements reçus ensemble). */
function intervalle(ouverture: EvenementBrut, fin: Date): Intervalle | null {
  const dureeMs = fin.getTime() - ouverture.recuLe.getTime();
  if (dureeMs < INTERVALLE_MIN_MS) return null;
  return { debut: ouverture.recuLe, fin, dureeMs, questionIndex: ouverture.questionIndex };
}

/** Début d'un silence : le dernier contact avant l'absence (D4-bis). */
function debutSilence(e: EvenementBrut): number {
  return e.recuLe.getTime() - (e.dureeMs ?? 0);
}

/**
 * Retour constaté pendant un intervalle ouvert (D4-bis) : son événement de fermeture ; un événement du
 * téléphone d'un autre chargement (une page fraîchement chargée est visible, a le focus et est en
 * ligne) ; pour une sortie de page ou une coupure, la fin d'un silence commencé après l'ouverture (le
 * téléphone a recontacté le serveur).
 */
function retour(ouvert: EvenementBrut, e: EvenementBrut, fermeture: string, parSilence: boolean): boolean {
  if (e.type === fermeture) return true;
  const autreChargement =
    !TYPES_SERVEUR.has(e.type) &&
    e.chargement !== null &&
    ouvert.chargement !== null &&
    e.chargement !== ouvert.chargement;
  if (autreChargement) return true;
  return (
    parSilence && e.type === "silence" && e.dureeMs !== null && debutSilence(e) >= ouvert.recuLe.getTime()
  );
}

/** Intervalles retenus par `paires`, et les événements d'ouverture qui les ont produits. */
type Paires = { intervalles: Intervalle[]; ouvertures: Set<EvenementBrut> };

/**
 * Paires ouverture → fermeture (D4-bis) : un intervalle ouvert se referme au premier retour constaté
 * (règle 1) ; l'événement qui ferme peut lui-même ouvrir l'intervalle suivant s'il est du type
 * d'ouverture. Une ouverture déjà en cours est ignorée ; ce qui reste ouvert se ferme à `fin`. Renvoie
 * aussi l'ensemble des événements d'ouverture qui ont produit un intervalle retenu (identité d'objet :
 * les mêmes objets que dans `tries`), pour la règle 3.
 */
function paires(
  tries: readonly EvenementBrut[],
  ouverture: string,
  fermeture: string,
  fin: Date,
  parSilence: boolean,
): Paires {
  const intervalles: Intervalle[] = [];
  const ouvertures = new Set<EvenementBrut>();
  let ouvert: EvenementBrut | null = null;
  for (const e of tries) {
    if (ouvert !== null && retour(ouvert, e, fermeture, parSilence)) {
      const i = intervalle(ouvert, e.recuLe);
      if (i) {
        intervalles.push(i);
        ouvertures.add(ouvert);
      }
      ouvert = null;
    }
    if (e.type === ouverture && ouvert === null) {
      ouvert = e;
    }
  }
  if (ouvert !== null) {
    const i = intervalle(ouvert, fin);
    if (i) {
      intervalles.push(i);
      ouvertures.add(ouvert);
    }
  }
  return { intervalles, ouvertures };
}

function ponctuels(tries: readonly EvenementBrut[], garder: (type: string) => boolean): Ponctuel[] {
  return tries.filter((e) => garder(e.type)).map((e) => ({ le: e.recuLe, questionIndex: e.questionIndex }));
}

/** Index du premier événement trié dont `recuLe ≥ depuis` (dichotomie, règle 5 de D4-bis). */
function premierIndex(tries: readonly EvenementBrut[], depuis: number): number {
  let lo = 0;
  let hi = tries.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((tries[mid] as EvenementBrut).recuLe.getTime() < depuis) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Événements triés reçus dans `[depuis, jusque]` (bornes incluses), trouvés par dichotomie (règle 5). */
function fenetre(tries: readonly EvenementBrut[], depuis: number, jusque: number): EvenementBrut[] {
  const resultat: EvenementBrut[] = [];
  for (
    let i = premierIndex(tries, depuis);
    i < tries.length && (tries[i] as EvenementBrut).recuLe.getTime() <= jusque;
    i++
  ) {
    resultat.push(tries[i] as EvenementBrut);
  }
  return resultat;
}

/** Consolidation des événements bruts d'un passage (D4 et D4-bis) ; `fin` ferme ce qui reste ouvert. */
export function consolider(evenements: readonly EvenementBrut[], fin: Date): Consolidation {
  const tries = [...evenements].sort(
    (a, b) => a.recuLe.getTime() - b.recuLe.getTime() || (a.sequence ?? 0) - (b.sequence ?? 0),
  );
  const { intervalles: pages, ouvertures: ouverturesSorties } = paires(
    tries,
    "masquee",
    "visible",
    fin,
    true,
  );
  const { intervalles: coupuresRetenues, ouvertures: ouverturesCoupures } = paires(
    tries,
    "hors_ligne",
    "en_ligne",
    fin,
    true,
  );
  const sorties = [...pages];
  const coupures = [...coupuresRetenues];
  for (const e of tries) {
    if (e.type !== "silence" || e.dureeMs === null) continue;
    const silence: Intervalle = {
      debut: new Date(debutSilence(e)),
      fin: e.recuLe,
      dureeMs: e.dureeMs,
      questionIndex: e.questionIndex,
    };
    if (pages.some((p) => chevauche(p, silence)) || coupuresRetenues.some((c) => chevauche(c, silence))) {
      continue;
    }
    const explications = fenetre(
      tries,
      silence.debut.getTime(),
      silence.fin.getTime() + FENETRE_EXPLICATION_MS,
    );
    // Règle 3 (D4-bis) : cet événement précis (identité d'objet, pas une comparaison d'heures : des
    // événements d'un même lot partagent la même heure de réception), reçu à la fin du silence ou après
    // et qui a ouvert un intervalle retenu, appartient à une nouvelle absence — il n'explique plus ce
    // silence.
    const nouvelleAbsence = (x: EvenementBrut, ouvertures: ReadonlySet<EvenementBrut>) =>
      x.recuLe.getTime() >= silence.fin.getTime() && ouvertures.has(x);
    const masqueeValide = explications.some(
      (x) => x.type === "masquee" && !nouvelleAbsence(x, ouverturesSorties),
    );
    const horsLigneValide = explications.some(
      (x) => x.type === "hors_ligne" && !nouvelleAbsence(x, ouverturesCoupures),
    );
    if (masqueeValide) sorties.push(silence);
    else if (horsLigneValide) coupures.push(silence);
    else sorties.push(silence);
  }
  const focus = paires(tries, "focus_perdu", "focus_revenu", fin, false).intervalles.filter(
    (f) => !sorties.some((s) => chevauche(s, f)),
  );
  const chargements = new Set<string>();
  const rechargements: Ponctuel[] = [];
  for (const e of tries) {
    if (e.chargement === null || TYPES_SERVEUR.has(e.type) || chargements.has(e.chargement)) continue;
    if (chargements.size > 0) rechargements.push({ le: e.recuLe, questionIndex: e.questionIndex });
    chargements.add(e.chargement);
  }
  return {
    sorties: sorties.sort(parFin),
    coupures: coupures.sort(parFin),
    focus,
    pressePapiers: ponctuels(tries, (type) => TYPES_PRESSE_PAPIERS.has(type)),
    ecranPartage: ponctuels(tries, (type) => type === "ecran_partage"),
    secondAppareil: ponctuels(tries, (type) => type === "second_appareil"),
    rechargements,
  };
}

function pointsSortie(sortie: Intervalle, p: Ponderation): number {
  return Math.min(p.sortieMax, Math.max(p.sortieMin, Math.round(sortie.dureeMs / 1000)));
}

/** Indice et détail (D5 et D4-bis) ; `validations` : heures des réponses validées par l'étudiant. */
export function calculerIndice(
  c: Consolidation,
  validations: readonly Date[],
  p: Ponderation = PONDERATION_V1,
): Indice {
  const focus = c.focus.filter((f) => f.dureeMs >= p.focusMinMs);
  const rapides = c.sorties.filter(
    (s) =>
      s.dureeMs >= p.reponseRapideSortieMinMs &&
      // Règle 4 (D4-bis) : la validation compte dès l'instant du retour (`[fin, fin + délai]`).
      validations.some(
        (v) => v.getTime() >= s.fin.getTime() && v.getTime() <= s.fin.getTime() + p.reponseRapideDelaiMs,
      ),
  );
  const lignes: Record<Signal, LigneIndice> = {
    sortie: {
      signal: "sortie",
      nombre: c.sorties.length,
      points: c.sorties.reduce((total, s) => total + pointsSortie(s, p), 0),
    },
    focus: { signal: "focus", nombre: focus.length, points: focus.length * p.focus },
    presse_papiers: {
      signal: "presse_papiers",
      nombre: c.pressePapiers.length,
      points: c.pressePapiers.length * p.pressePapiers,
    },
    reponse_rapide: {
      signal: "reponse_rapide",
      nombre: rapides.length,
      points: rapides.length * p.reponseRapide,
    },
    second_appareil: {
      signal: "second_appareil",
      nombre: c.secondAppareil.length,
      points: c.secondAppareil.length * p.secondAppareil,
    },
    ecran_partage: {
      signal: "ecran_partage",
      nombre: c.ecranPartage.length,
      points: c.ecranPartage.length * p.ecranPartage,
    },
    coupure: { signal: "coupure", nombre: c.coupures.length, points: 0 },
    rechargement: { signal: "rechargement", nombre: c.rechargements.length, points: 0 },
  };
  const detail = SIGNAUX.map((signal) => lignes[signal]).filter((ligne) => ligne.nombre > 0);
  const total = detail.reduce((somme, ligne) => somme + ligne.points, 0);
  return { valeur: Math.min(p.plafond, total), version: p.version, detail };
}

/** Faits notables d'un passage, du plus ancien au plus récent (dernier événement, alertes, D10). */
export function faitsNotables(c: Consolidation, p: Ponderation = PONDERATION_V1): Fait[] {
  const faits: Fait[] = [
    ...c.sorties.map((s): Fait => ({
      type: "sortie",
      le: s.fin,
      dureeMs: s.dureeMs,
      questionIndex: s.questionIndex,
    })),
    ...c.focus
      .filter((f) => f.dureeMs >= p.focusMinMs)
      .map((f): Fait => ({ type: "focus", le: f.fin, dureeMs: f.dureeMs, questionIndex: f.questionIndex })),
    ...c.coupures.map((s): Fait => ({
      type: "coupure",
      le: s.fin,
      dureeMs: s.dureeMs,
      questionIndex: s.questionIndex,
    })),
    ...c.pressePapiers.map((x): Fait => ({
      type: "presse_papiers",
      le: x.le,
      dureeMs: null,
      questionIndex: x.questionIndex,
    })),
    ...c.ecranPartage.map((x): Fait => ({
      type: "ecran_partage",
      le: x.le,
      dureeMs: null,
      questionIndex: x.questionIndex,
    })),
    ...c.secondAppareil.map((x): Fait => ({
      type: "second_appareil",
      le: x.le,
      dureeMs: null,
      questionIndex: x.questionIndex,
    })),
    ...c.rechargements.map((x): Fait => ({
      type: "rechargement",
      le: x.le,
      dureeMs: null,
      questionIndex: x.questionIndex,
    })),
  ];
  return faits.sort((a, b) => a.le.getTime() - b.le.getTime());
}
