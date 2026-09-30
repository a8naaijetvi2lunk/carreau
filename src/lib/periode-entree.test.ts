import { describe, expect, it } from "vitest";
import { periodeEntreeMs } from "./periode-entree";
import type { EtatEntree } from "./vue-entree";

const SERVEUR = "2026-09-21T14:13:20.000Z";
const MAINTENANT = Date.parse(SERVEUR);
const SESSION = { titre: "Algorithmique", classe: "TD2", enseignant: "Claire Arnaud" };

function etat(partiel: Record<string, unknown>): EtatEntree {
  return { serveurMaintenant: SERVEUR, session: SESSION, ...partiel } as EtatEntree;
}

describe("periodeEntreeMs", () => {
  it("interroge toutes les 2 s en salle d'attente et avant le départ, 5 s ensuite (spec §7)", () => {
    expect(periodeEntreeMs(etat({ etape: "attente" }), MAINTENANT)).toBe(2000);
    expect(
      periodeEntreeMs(etat({ etape: "demarrage", demarreLe: "2026-09-21T14:13:25.000Z" }), MAINTENANT),
    ).toBe(2000);
    expect(periodeEntreeMs(etat({ etape: "demarrage", demarreLe: SERVEUR }), MAINTENANT)).toBe(5000);
  });

  it("toutes les 5 s pendant l'information, 2 s pendant une demande en attente", () => {
    expect(periodeEntreeMs(etat({ etape: "information" }), MAINTENANT)).toBe(5000);
    expect(periodeEntreeMs(etat({ etape: "demande", statut: "en_attente" }), MAINTENANT)).toBe(2000);
  });

  it("n'interroge pas pendant une saisie ni sur un écran final", () => {
    for (const partiel of [
      { etape: "code" },
      { etape: "nom" },
      { etape: "demande", statut: "refusee" },
      { etape: "demande", statut: "expiree" },
      { etape: "remplace" },
      { etape: "fermee", raison: "annulee" },
    ]) {
      expect(periodeEntreeMs(etat(partiel), MAINTENANT)).toBeNull();
    }
  });

  it("pendant l'examen : 5 s, ou juste après l'expiration de l'échéance si elle vient plus tôt", () => {
    expect(periodeEntreeMs(etat({ etape: "question", echeance: null }), MAINTENANT)).toBe(5000);
    // Échéance dans 60 s : 5 s.
    expect(
      periodeEntreeMs(etat({ etape: "question", echeance: "2026-09-21T14:14:20.000Z" }), MAINTENANT),
    ).toBe(5000);
    // Échéance dans 1 s : expiration (tolérance de 3 s) + 300 ms, soit 4,3 s.
    expect(
      periodeEntreeMs(etat({ etape: "question", echeance: "2026-09-21T14:13:21.000Z" }), MAINTENANT),
    ).toBe(4300);
    // Expiration déjà passée : 300 ms au plus tôt.
    expect(
      periodeEntreeMs(etat({ etape: "question", echeance: "2026-09-21T14:13:00.000Z" }), MAINTENANT),
    ).toBe(300);
  });

  it("relit l'état toutes les 15 s sur l'écran de fin (correction publiée plus tard)", () => {
    expect(periodeEntreeMs(etat({ etape: "fin" }), MAINTENANT)).toBe(15_000);
  });
});
