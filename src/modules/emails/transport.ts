/**
 * Transport des emails : Resend par défaut, remplaçable dans les tests. Le SDK Resend ne lève
 * pas pour un refus (domaine non vérifié, expéditeur invalide, quota) : il renvoie
 * `{ data, error }`, toujours lu. Une panne réseau, elle, lève : elle devient un échec.
 */
import "server-only";
import { Resend } from "resend";

export type EnvoiTransport = {
  cleApi: string;
  expediteur: string;
  destinataire: string;
  sujet: string;
  texte: string;
  html: string;
};

export type ResultatTransport =
  { ok: true; id: string } | { ok: false; nom: string; message: string; statut: number | null };

export type TransportEmail = (envoi: EnvoiTransport) => Promise<ResultatTransport>;

export const transportResend: TransportEmail = async (envoi) => {
  try {
    const { data, error } = await new Resend(envoi.cleApi).emails.send({
      from: envoi.expediteur,
      to: envoi.destinataire,
      subject: envoi.sujet,
      text: envoi.texte,
      html: envoi.html,
    });
    if (error)
      return { ok: false, nom: error.name, message: error.message, statut: error.statusCode ?? null };
    return { ok: true, id: data?.id ?? "" };
  } catch {
    return { ok: false, nom: "erreur_reseau", message: "Resend est injoignable.", statut: null };
  }
};

let transportCourant: TransportEmail = transportResend;

export function transportEmail(): TransportEmail {
  return transportCourant;
}

/** Remplace le transport (tests uniquement). Sans argument, rétablit Resend. */
export function definirTransportEmailPourLesTests(transport?: TransportEmail): void {
  transportCourant = transport ?? transportResend;
}
