import { describe, expect, it } from "vitest";
import {
  echapperHtml,
  LIBELLES_MODELE_TEST,
  MODELES_TEST,
  modeleInvitation,
  modeleReinitialisation,
  modeleTest,
} from "./modeles";

const LIEN = "https://carreau.exemple.fr/activation/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd";
const EXPIRE = new Date("2026-10-06T08:00:00.000Z");

describe("echapperHtml", () => {
  it("échappe les caractères spéciaux du HTML", () => {
    expect(echapperHtml(`<a href="x">L'été & co</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;L&#39;été &amp; co&lt;/a&gt;",
    );
  });
});

describe("invitation", () => {
  it("donne l'inviteur, le rôle, le lien et l'échéance, en texte et en HTML", () => {
    const message = modeleInvitation({
      inviteur: "Yves Charvis",
      role: "enseignant",
      lien: LIEN,
      expireLe: EXPIRE,
      relance: false,
    });
    expect(message.sujet).toBe("Invitation à rejoindre Carreau");
    expect(message.texte).toContain("Yves Charvis vous invite à rejoindre Carreau");
    expect(message.texte).toContain("avec le rôle enseignant");
    for (const partie of [message.texte, message.html]) {
      expect(partie).toContain(LIEN);
      expect(partie).toContain("6 octobre 2026 à 10:00");
    }
  });

  it("la relance a son sujet et prévient que l'ancien lien ne fonctionne plus", () => {
    const message = modeleInvitation({
      inviteur: "Yves Charvis",
      role: "admin",
      lien: LIEN,
      expireLe: EXPIRE,
      relance: true,
    });
    expect(message.sujet).toBe("Rappel : votre invitation à rejoindre Carreau");
    expect(message.texte).toContain("avec le rôle admin");
    expect(message.texte).toContain("ne fonctionne plus");
  });

  it("échappe le nom de l'inviteur dans le HTML", () => {
    const message = modeleInvitation({
      inviteur: "<script>alert(1)</script>",
      role: "enseignant",
      lien: LIEN,
      expireLe: EXPIRE,
      relance: false,
    });
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
  });
});

describe("réinitialisation", () => {
  it("donne le lien et son échéance d'une heure", () => {
    const message = modeleReinitialisation({ lien: LIEN, expireLe: EXPIRE });
    expect(message.sujet).toBe("Réinitialisation de votre mot de passe Carreau");
    expect(message.texte).toContain(LIEN);
    expect(message.texte).toContain("6 octobre 2026 à 10:00");
    expect(message.texte).toContain("ignorez ce message");
  });
});

describe("modèles de test", () => {
  it.each(MODELES_TEST)("%s : sujet préfixé par [Test] et libellé présent", (modele) => {
    const message = modeleTest(
      modele,
      "https://carreau.exemple.fr/connexion",
      new Date("2026-09-29T08:00:00.000Z"),
    );
    expect(message.sujet.startsWith("[Test] ")).toBe(true);
    expect(message.texte).toContain("https://carreau.exemple.fr/connexion");
    expect(LIBELLES_MODELE_TEST[modele].length).toBeGreaterThan(0);
  });
});
