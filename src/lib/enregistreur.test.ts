import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EnregistreurDiffere,
  MESSAGE_ENVOI_IMPOSSIBLE,
  RegistreVidanges,
  type EtatEnregistrement,
  type ResultatEnvoi,
} from "./enregistreur";

const LE = new Date("2026-09-29T08:12:00.000Z");

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function monter(reponse: (valeur: string) => Promise<ResultatEnvoi> = async () => ({ ok: true, le: LE })) {
  const envoyer = vi.fn(reponse);
  const etats: EtatEnregistrement[] = [];
  const enregistreur = new EnregistreurDiffere<string>(envoyer, (etat) => etats.push(etat), 800);
  return { envoyer, etats, enregistreur };
}

describe("EnregistreurDiffere", () => {
  it("n'envoie que la dernière valeur, 800 ms après la dernière modification", async () => {
    const { envoyer, etats, enregistreur } = monter();
    enregistreur.planifier("a");
    await vi.advanceTimersByTimeAsync(500);
    enregistreur.planifier("ab");
    await vi.advanceTimersByTimeAsync(799);
    expect(envoyer).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(envoyer).toHaveBeenCalledExactlyOnceWith("ab");
    expect(etats.at(-1)).toEqual({ etape: "enregistre", le: LE });
    expect(enregistreur.occupe).toBe(false);
  });

  it("vide tout de suite ce qui attend et annule le minuteur", async () => {
    const { envoyer, enregistreur } = monter();
    enregistreur.planifier("a");
    expect(enregistreur.occupe).toBe(true);
    await expect(enregistreur.vidanger()).resolves.toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(envoyer).toHaveBeenCalledExactlyOnceWith("a");
  });

  it("répond vrai sans rien envoyer quand rien n'attend", async () => {
    const { envoyer, enregistreur } = monter();
    await expect(enregistreur.vidanger()).resolves.toBe(true);
    expect(envoyer).not.toHaveBeenCalled();
  });

  it("enchaîne les envois : le second attend la réponse du premier", async () => {
    const ordre: string[] = [];
    let terminerPremier: (resultat: ResultatEnvoi) => void = () => undefined;
    const { enregistreur } = monter((valeur) => {
      ordre.push(`début ${valeur}`);
      if (valeur === "a") {
        return new Promise<ResultatEnvoi>((resoudre) => {
          terminerPremier = (resultat) => {
            ordre.push("fin a");
            resoudre(resultat);
          };
        });
      }
      return Promise.resolve({ ok: true, le: LE });
    });
    enregistreur.planifier("a");
    const premier = enregistreur.vidanger();
    enregistreur.planifier("b");
    const second = enregistreur.vidanger();
    await vi.advanceTimersByTimeAsync(0);
    expect(ordre).toEqual(["début a"]);
    terminerPremier({ ok: true, le: LE });
    await expect(premier).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(ordre).toEqual(["début a", "fin a", "début b"]);
  });

  it("signale l'échec et garde la valeur refusée pour la vidange suivante", async () => {
    let refuser = true;
    const { envoyer, etats, enregistreur } = monter(async () =>
      refuser ? { ok: false, message: "L'énoncé dépasse 2000 caractères." } : { ok: true, le: LE },
    );
    enregistreur.planifier("a");
    await expect(enregistreur.vidanger()).resolves.toBe(false);
    expect(etats.at(-1)).toEqual({ etape: "erreur", message: "L'énoncé dépasse 2000 caractères." });
    expect(enregistreur.occupe).toBe(true);
    refuser = false;
    await expect(enregistreur.vidanger()).resolves.toBe(true);
    expect(envoyer).toHaveBeenLastCalledWith("a");
    expect(enregistreur.occupe).toBe(false);
  });

  it("transforme une exception d'envoi (réseau coupé) en échec", async () => {
    const { etats, enregistreur } = monter(async () => {
      throw new TypeError("Failed to fetch");
    });
    enregistreur.planifier("a");
    await expect(enregistreur.vidanger()).resolves.toBe(false);
    expect(etats.at(-1)).toEqual({ etape: "erreur", message: MESSAGE_ENVOI_IMPOSSIBLE });
  });

  it("n'annonce pas « enregistré » quand une modification plus récente attend", async () => {
    const { etats, enregistreur } = monter();
    enregistreur.planifier("a");
    const envoi = enregistreur.vidanger();
    enregistreur.planifier("ab");
    await envoi;
    expect(etats.at(-1)).toEqual({ etape: "modifie" });
  });
});

describe("RegistreVidanges", () => {
  it("attend toutes les vidanges inscrites et répond faux si l'une échoue", async () => {
    const registre = new RegistreVidanges();
    const desinscrire = registre.inscrire(async () => true);
    registre.inscrire(async () => false);
    await expect(registre.toutVidanger()).resolves.toBe(false);
    desinscrire();
  });

  it("répond vrai sans vidange inscrite, ou après désinscription", async () => {
    const registre = new RegistreVidanges();
    await expect(registre.toutVidanger()).resolves.toBe(true);
    const desinscrire = registre.inscrire(async () => false);
    desinscrire();
    await expect(registre.toutVidanger()).resolves.toBe(true);
  });
});
