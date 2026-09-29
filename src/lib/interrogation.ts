/**
 * Interrogation régulière d'une route d'API (spec §7, décision D16 du plan du lot 4), sans React :
 * - un appel à la fois ; le suivant part `periodeMs(résultat)` ms après la fin du précédent, et
 *   `null` arrête jusqu'au prochain `relancer()` ;
 * - après un échec, délai de 1 s doublé à chaque échec consécutif, plafonné à 30 s ;
 * - `suspendreSiMasque` (enseignant) : aucun appel tant que l'onglet est masqué ;
 * - au retour au premier plan, appel immédiat (étudiant comme enseignant) ;
 * - `relancer()` abandonne l'appel en cours, dont la réponse serait périmée, et en lance un aussitôt.
 * Les rappels partent de minuteries, jamais d'un rendu React.
 */
export type OptionsInterrogation<T> = {
  /** Un appel ; une exception compte comme un échec (réseau coupé, erreur du serveur). */
  appeler: (signal: AbortSignal) => Promise<T>;
  /** Délai avant l'appel suivant, après un succès ; null : plus d'appel jusqu'à `relancer()`. */
  periodeMs: (resultat: T) => number | null;
  surResultat: (resultat: T) => void;
  /** Échec : nombre d'échecs consécutifs (1, 2…). */
  surEchec?: (echecs: number) => void;
  suspendreSiMasque?: boolean;
};

export const DELAI_ECHEC_MS = 1_000;
export const DELAI_ECHEC_MAX_MS = 30_000;

/** Délai avant un nouvel essai après `echecs` échecs consécutifs : 1 s, 2 s, 4 s… plafonné à 30 s. */
export function delaiApresEchec(echecs: number): number {
  return Math.min(DELAI_ECHEC_MS * 2 ** Math.max(0, echecs - 1), DELAI_ECHEC_MAX_MS);
}

export class Interrogation<T> {
  private readonly options: OptionsInterrogation<T>;
  private actif = false;
  private minuterie: ReturnType<typeof setTimeout> | null = null;
  private enCours: AbortController | null = null;
  private echecs = 0;

  constructor(options: OptionsInterrogation<T>) {
    this.options = options;
  }

  /** Démarre par un appel immédiat ; sans effet si elle tourne déjà. */
  demarrer(): void {
    if (this.actif) return;
    this.actif = true;
    this.echecs = 0;
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.surVisibilite);
    this.planifier(0);
  }

  /** Arrête : minuterie annulée, appel en cours abandonné, plus aucun rappel. */
  arreter(): void {
    this.actif = false;
    if (this.minuterie !== null) clearTimeout(this.minuterie);
    this.minuterie = null;
    this.enCours?.abort();
    this.enCours = null;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.surVisibilite);
  }

  /** Appel immédiat (après une action) ; un appel en cours est abandonné : sa réponse serait périmée. */
  relancer(): void {
    if (!this.actif) return;
    this.enCours?.abort();
    this.enCours = null;
    this.planifier(0);
  }

  private readonly surVisibilite = (): void => {
    if (document.visibilityState === "visible") this.relancer();
  };

  private masquee(): boolean {
    return (
      Boolean(this.options.suspendreSiMasque) &&
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    );
  }

  private planifier(delaiMs: number): void {
    if (!this.actif) return;
    if (this.minuterie !== null) clearTimeout(this.minuterie);
    this.minuterie = setTimeout(() => {
      this.minuterie = null;
      void this.executer();
    }, delaiMs);
  }

  private async executer(): Promise<void> {
    // Onglet enseignant masqué : l'événement de visibilité relancera.
    if (!this.actif || this.masquee()) return;
    const controleur = new AbortController();
    this.enCours = controleur;
    let delai: number | null;
    try {
      const resultat = await this.options.appeler(controleur.signal);
      if (!this.actif || controleur.signal.aborted) return;
      this.echecs = 0;
      this.options.surResultat(resultat);
      delai = this.options.periodeMs(resultat);
    } catch {
      if (!this.actif || controleur.signal.aborted) return;
      this.echecs += 1;
      this.options.surEchec?.(this.echecs);
      delai = delaiApresEchec(this.echecs);
    } finally {
      if (this.enCours === controleur) this.enCours = null;
    }
    if (delai !== null) this.planifier(delai);
  }
}
