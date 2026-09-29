/**
 * Enregistrement automatique différé (éditeur de QCM, décision D8 du plan du lot 3). Chaque
 * modification planifie l'envoi de la dernière valeur `delaiMs` après la dernière frappe ;
 * `vidanger()` envoie tout de suite ce qui attend (avant une navigation ou une autre action). Les
 * envois s'enchaînent : jamais deux à la fois, toujours dans l'ordre des modifications.
 * Aucune dépendance à React : le composant crée une instance et lui passe son `setState`, appelé
 * seulement depuis des gestionnaires d'événements ou des promesses (règles du React Compiler).
 */

export type EtatEnregistrement =
  | { etape: "repos" }
  | { etape: "modifie" }
  | { etape: "enCours" }
  | { etape: "enregistre"; le: Date }
  | { etape: "erreur"; message: string };

export type ResultatEnvoi = { ok: true; le: Date } | { ok: false; message: string };

export const MESSAGE_ENVOI_IMPOSSIBLE = "Connexion impossible : vérifie ta connexion, l'envoi sera retenté.";

export class EnregistreurDiffere<T> {
  private enAttente: { valeur: T } | null = null;
  private minuteur: ReturnType<typeof setTimeout> | null = null;
  private envoisEnCours = 0;
  private chaine: Promise<boolean> = Promise.resolve(true);
  private prisesEnCharge = 0;

  constructor(
    private readonly envoyer: (valeur: T) => Promise<ResultatEnvoi>,
    private readonly signaler: (etat: EtatEnregistrement) => void,
    private readonly delaiMs = 800,
  ) {}

  /** Vrai tant qu'une modification n'est pas enregistrée (en attente ou en cours d'envoi). */
  get occupe(): boolean {
    return this.enAttente !== null || this.envoisEnCours > 0;
  }

  planifier(valeur: T): void {
    this.enAttente = { valeur };
    this.arreterMinuteur();
    this.minuteur = setTimeout(() => void this.vidanger(), this.delaiMs);
    this.signaler({ etape: "modifie" });
  }

  /** Envoie ce qui attend ; résout vrai quand tout ce qui a été planifié est enregistré. */
  vidanger(): Promise<boolean> {
    this.arreterMinuteur();
    const attente = this.enAttente;
    if (attente === null) return this.chaine;
    this.enAttente = null;
    this.prisesEnCharge += 1;
    const numero = this.prisesEnCharge;
    this.envoisEnCours += 1;
    this.signaler({ etape: "enCours" });
    this.chaine = this.chaine.then(async () => {
      let resultat: ResultatEnvoi;
      try {
        resultat = await this.envoyer(attente.valeur);
      } catch {
        resultat = { ok: false, message: MESSAGE_ENVOI_IMPOSSIBLE };
      }
      this.envoisEnCours -= 1;
      if (!resultat.ok) {
        // Seule la dernière valeur prise en charge revient en attente : une valeur plus récente, déjà
        // partie derrière celle-ci, la remplace (la dernière écriture l'emporte, décision D8).
        if (numero === this.prisesEnCharge) {
          this.enAttente ??= attente;
          this.signaler({ etape: "erreur", message: resultat.message });
        }
        return false;
      }
      if (this.enAttente === null && this.envoisEnCours === 0) {
        this.signaler({ etape: "enregistre", le: resultat.le });
      }
      return true;
    });
    return this.chaine;
  }

  private arreterMinuteur(): void {
    if (this.minuteur !== null) {
      clearTimeout(this.minuteur);
      this.minuteur = null;
    }
  }
}

/** Vidanges des éditeurs affichés : une navigation ou une action les attend toutes avant de partir. */
export class RegistreVidanges {
  private readonly vidanges = new Set<() => Promise<boolean>>();

  /** Inscrit une vidange ; renvoie la fonction qui la désinscrit. */
  inscrire(vidange: () => Promise<boolean>): () => void {
    this.vidanges.add(vidange);
    return () => {
      this.vidanges.delete(vidange);
    };
  }

  async toutVidanger(): Promise<boolean> {
    const resultats = await Promise.all([...this.vidanges].map((vidange) => vidange()));
    return resultats.every(Boolean);
  }
}
