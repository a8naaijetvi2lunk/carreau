/**
 * Cookies des téléphones (spec §6.2, décisions D6 et D7 du plan du lot 4) : ticket d'entrée et jeton
 * d'appareil. Nom et attribut `Secure` suivent le protocole de `APP_URL`, comme le cookie de session
 * du lot 1. Lus dans l'en-tête `Cookie`, posés par `Set-Cookie` : jamais `next/headers`.
 */
import "server-only";
import { configCookie } from "@/lib/cookie-session";
import { enteteCookie, lireCookie } from "@/lib/cookies";
import { env } from "@/lib/env";

export const DUREE_COOKIE_TICKET_S = 10 * 60;
/** 30 jours : la correction se consultera sur le même appareil (lot 7). */
export const DUREE_COOKIE_APPAREIL_S = 30 * 24 * 3600;

function configs() {
  const appUrl = env().APP_URL;
  return {
    ticket: configCookie(appUrl, "carreau-entree"),
    appareil: configCookie(appUrl, "carreau-participation"),
  };
}

export type CookiesEntree = { ticket: string | null; jetonAppareil: string | null };

/** Ticket et jeton d'appareil envoyés par le téléphone. */
export function lireCookiesEntree(entetes: { get(nom: string): string | null }): CookiesEntree {
  const { ticket, appareil } = configs();
  return { ticket: lireCookie(entetes, ticket.nom), jetonAppareil: lireCookie(entetes, appareil.nom) };
}

/** Ajoute à la réponse les cookies à poser : ticket émis, nouveau jeton d'appareil. */
export function poserCookiesEntree(
  reponse: Response,
  cookies: { ticket?: string; jetonAppareil?: string },
): Response {
  const { ticket, appareil } = configs();
  if (cookies.ticket) {
    reponse.headers.append(
      "Set-Cookie",
      enteteCookie(ticket.nom, cookies.ticket, {
        securise: ticket.securise,
        dureeSecondes: DUREE_COOKIE_TICKET_S,
      }),
    );
  }
  if (cookies.jetonAppareil) {
    reponse.headers.append(
      "Set-Cookie",
      enteteCookie(appareil.nom, cookies.jetonAppareil, {
        securise: appareil.securise,
        dureeSecondes: DUREE_COOKIE_APPAREIL_S,
      }),
    );
  }
  return reponse;
}

/** Noms des deux cookies selon `APP_URL` (tests des routes). */
export function nomsCookiesEntree(): { ticket: string; appareil: string } {
  const { ticket, appareil } = configs();
  return { ticket: ticket.nom, appareil: appareil.nom };
}
