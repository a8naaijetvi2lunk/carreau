import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { signer } from "@/lib/signature";
import { DUREE_TICKET_MS, emettreTicket, lireTicket } from "./ticket";

const INSTANT = 1_790_000_000_000;
const horloge = horlogeFixe(INSTANT);

beforeEach(() => {
  horloge.fixer(INSTANT);
  definirHorlogePourLesTests(horloge);
});
afterEach(() => definirHorlogePourLesTests());

describe("ticket d'entrée", () => {
  it("lie le ticket à sa session pour 10 minutes, avec un nonce aléatoire", () => {
    const sessionId = randomUUID();
    const valeur = emettreTicket(sessionId);
    expect(valeur).toMatch(/^[A-Za-z0-9._-]+$/);
    const ticket = lireTicket(valeur);
    expect(ticket?.sessionId).toBe(sessionId);
    expect(ticket?.nonce).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(ticket?.expireLe.getTime()).toBe(INSTANT + DUREE_TICKET_MS);
    expect(lireTicket(emettreTicket(sessionId))?.nonce).not.toBe(ticket?.nonce);
  });

  it("expire au bout de 10 minutes", () => {
    const valeur = emettreTicket(randomUUID());
    horloge.avancer(DUREE_TICKET_MS - 1);
    expect(lireTicket(valeur)).not.toBeNull();
    horloge.avancer(1);
    expect(lireTicket(valeur)).toBeNull();
  });

  it("refuse un ticket absent, trop long, falsifié ou signé pour un autre usage", () => {
    const sessionId = randomUUID();
    const valeur = emettreTicket(sessionId);
    expect(lireTicket(null)).toBeNull();
    expect(lireTicket("")).toBeNull();
    expect(lireTicket(`${valeur}${"x".repeat(300)}`)).toBeNull();
    expect(lireTicket(valeur.replace(sessionId, randomUUID()))).toBeNull();
    const contenu = valeur.slice(0, valeur.lastIndexOf("."));
    expect(lireTicket(signer(contenu, "autre-usage"))).toBeNull();
  });

  it("refuse un contenu signé mais mal formé", () => {
    const expire = String(INSTANT + 60_000);
    const nonce = "A".repeat(22);
    expect(lireTicket(signer(["v2", randomUUID(), expire, nonce].join("."), "ticket-entree"))).toBeNull();
    expect(lireTicket(signer(["v1", "pas-un-uuid", expire, nonce].join("."), "ticket-entree"))).toBeNull();
    expect(lireTicket(signer(["v1", randomUUID(), "demain", nonce].join("."), "ticket-entree"))).toBeNull();
    expect(lireTicket(signer(["v1", randomUUID(), expire, "court"].join("."), "ticket-entree"))).toBeNull();
    expect(
      lireTicket(signer(["v1", randomUUID(), expire, nonce, "de-trop"].join("."), "ticket-entree")),
    ).toBeNull();
  });
});
