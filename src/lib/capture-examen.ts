/**
 * Capture de la page d'examen (spec §8.2 ; décision D8 et amendements A1, A2 et A4 du plan du lot 6) :
 * les transitions observées par le navigateur, numérotées, mises en file et envoyées par lots. Le
 * téléphone n'envoie jamais d'heure ni de durée : le serveur horodate à la réception. Sans React ni
 * accès direct au navigateur : fenêtre, document et envoi sont fournis (testables).
 */
import {
  LOT_EVENEMENTS_MAX,
  type LotEvenementsTelephone,
  type TypeEvenementTelephone,
} from "./regles-surveillance";

/** Nouvel essai après un envoi échoué (réseau coupé, limiteur, serveur indisponible). */
export const DELAI_REESSAI_MS = 3_000;
/** Écart de taille (largeur ou hauteur) au-delà duquel un redimensionnement est « marqué ». */
export const ECART_REDIMENSIONNEMENT = 0.2;
/** Au plus un écran partagé signalé toutes les 30 s. */
export const ESPACEMENT_ECRAN_PARTAGE_MS = 30_000;

export type FenetreCapture = EventTarget & { innerWidth: number; innerHeight: number };
export type DocumentCapture = EventTarget & { visibilityState: DocumentVisibilityState };

export type OptionsCapture = {
  fenetre: FenetreCapture;
  document: DocumentCapture;
  /** Identifiant de ce chargement de la page (A4). */
  chargement: string;
  /** Numéro de l'événement suivant, commun à toutes les captures d'un même chargement. */
  numeroter: () => number;
  /** Envoie un lot ; vrai s'il est traité pour de bon (enregistré ou refusé), faux pour réessayer. */
  envoyer: (lot: LotEvenementsTelephone) => Promise<boolean>;
  maintenant: () => number;
};

type EvenementCapture = LotEvenementsTelephone["evenements"][number];
type Taille = { largeur: number; hauteur: number };

function paysage(t: Taille): boolean {
  return t.largeur > t.hauteur;
}

/** 12 octets aléatoires en base64url : identifiant d'un chargement de la page (A4). */
export function identifiantChargement(): string {
  const octets = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...octets))
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}

export class CaptureExamen {
  private readonly options: OptionsCapture;
  private file: EvenementCapture[] = [];
  private envoiEnCours = false;
  private reessai: ReturnType<typeof setTimeout> | null = null;
  private actif = false;
  /** Taille de référence de l'heuristique d'écran partagé : au démarrage, puis après chaque rotation ou signalement. */
  private reference: Taille = { largeur: 0, hauteur: 0 };
  private dernierEcranPartage = Number.NEGATIVE_INFINITY;
  private readonly abonnements: { cible: EventTarget; type: string; ecouteur: () => void }[] = [];

  constructor(options: OptionsCapture) {
    this.options = options;
  }

  /** Écoute la page et envoie « debut » ; sans effet si la capture tourne déjà. */
  demarrer(): void {
    if (this.actif) return;
    this.actif = true;
    const { fenetre, document } = this.options;
    this.reference = { largeur: fenetre.innerWidth, hauteur: fenetre.innerHeight };
    this.ecouter(document, "visibilitychange", () =>
      this.noter(document.visibilityState === "hidden" ? "masquee" : "visible"),
    );
    this.ecouter(fenetre, "pagehide", () => this.noter("masquee"));
    this.ecouter(fenetre, "blur", () => {
      if (document.visibilityState === "visible") this.noter("focus_perdu");
    });
    this.ecouter(fenetre, "focus", () => this.noter("focus_revenu"));
    this.ecouter(document, "copy", () => this.noter("copie"));
    this.ecouter(document, "cut", () => this.noter("coupe"));
    this.ecouter(document, "paste", () => this.noter("colle"));
    this.ecouter(fenetre, "resize", () => this.redimensionnement());
    this.ecouter(fenetre, "offline", () => this.noter("hors_ligne"));
    this.ecouter(fenetre, "online", () => this.noter("en_ligne"));
    this.noter("debut");
  }

  /** Retire les écouteurs et abandonne les nouveaux essais (écran de fin, page quittée). */
  arreter(): void {
    this.actif = false;
    for (const { cible, type, ecouteur } of this.abonnements) cible.removeEventListener(type, ecouteur);
    this.abonnements.length = 0;
    this.annulerReessai();
  }

  private ecouter(cible: EventTarget, type: string, ecouteur: () => void): void {
    cible.addEventListener(type, ecouteur);
    this.abonnements.push({ cible, type, ecouteur });
  }

  private noter(type: TypeEvenementTelephone): void {
    if (!this.actif) return;
    this.file.push({ n: this.options.numeroter(), type });
    // Réseau revenu : la file part aussitôt, sans attendre le nouvel essai.
    if (type === "en_ligne") this.annulerReessai();
    if (type === "masquee" && (this.envoiEnCours || this.reessai !== null)) {
      // La page se cache et peut être gelée : la fin de la file part tout de suite, en parallèle (D8).
      // Le serveur dédoublonne ce qui partirait deux fois (chargement, numéro).
      void this.envoyerLot(this.file.slice(-LOT_EVENEMENTS_MAX));
      return;
    }
    void this.vider();
  }

  private annulerReessai(): void {
    if (this.reessai === null) return;
    clearTimeout(this.reessai);
    this.reessai = null;
  }

  /** Envoie un lot ; s'il est traité, ses événements quittent la file (même arrivés entre-temps dans un autre lot). */
  private async envoyerLot(lot: EvenementCapture[]): Promise<boolean> {
    const traite = await this.options
      .envoyer({ chargement: this.options.chargement, evenements: lot })
      .catch(() => false);
    if (traite) {
      const envoyes = new Set(lot.map((e) => e.n));
      this.file = this.file.filter((e) => !envoyes.has(e.n));
    }
    return traite;
  }

  /** Vide la file par lots de 50, un envoi à la fois ; un échec garde la file et réessaie dans 3 s. */
  private async vider(): Promise<void> {
    if (this.envoiEnCours || this.reessai !== null) return;
    this.envoiEnCours = true;
    try {
      while (this.actif && this.file.length > 0) {
        if (await this.envoyerLot(this.file.slice(0, LOT_EVENEMENTS_MAX))) continue;
        if (this.actif) {
          this.reessai = setTimeout(() => {
            this.reessai = null;
            void this.vider();
          }, DELAI_REESSAI_MS);
        }
        return;
      }
    } finally {
      this.envoiEnCours = false;
    }
  }

  /** Heuristique d'écran partagé (spec §8.2) : page visible, plus de 20 % d'écart, rotation exclue. */
  private redimensionnement(): void {
    const { fenetre, document, maintenant } = this.options;
    const taille = { largeur: fenetre.innerWidth, hauteur: fenetre.innerHeight };
    if (document.visibilityState !== "visible") return;
    const reference = this.reference;
    if (reference.largeur === 0 || reference.hauteur === 0 || paysage(taille) !== paysage(reference)) {
      this.reference = taille;
      return;
    }
    const ecart = Math.max(
      Math.abs(taille.largeur - reference.largeur) / reference.largeur,
      Math.abs(taille.hauteur - reference.hauteur) / reference.hauteur,
    );
    if (ecart <= ECART_REDIMENSIONNEMENT) return;
    this.reference = taille;
    const instant = maintenant();
    if (instant - this.dernierEcranPartage < ESPACEMENT_ECRAN_PARTAGE_MS) return;
    this.dernierEcranPartage = instant;
    this.noter("ecran_partage");
  }
}
