import { describe, expect, it } from "vitest";
import {
  codeDepuisQr,
  MESSAGE_CAMERA_REFUSEE,
  MESSAGE_QR_ETRANGER,
  MESSAGE_SANS_CAMERA,
} from "./qr-rejoindre";

const ORIGINE = "https://carreau.exemple.fr";

describe("codeDepuisQr", () => {
  it("tire le code du QR projeté (fragment de /rejoindre, même origine)", () => {
    expect(codeDepuisQr("https://carreau.exemple.fr/rejoindre#K7M4QP", ORIGINE)).toBe("K7M4QP");
    expect(codeDepuisQr("  https://carreau.exemple.fr/rejoindre#k7m4qp  ", ORIGINE)).toBe("k7m4qp");
    expect(codeDepuisQr("https://carreau.exemple.fr/rejoindre?source=qr#K7M4QP", ORIGINE)).toBe("K7M4QP");
    expect(codeDepuisQr("https://carreau.exemple.fr/rejoindre#%20K7M4QP%20", ORIGINE)).toBe("K7M4QP");
  });

  it("refuse une autre origine : l'adresse lue n'est jamais suivie", () => {
    for (const texte of [
      "https://pirate.exemple/rejoindre#K7M4QP",
      "http://carreau.exemple.fr/rejoindre#K7M4QP",
      "https://carreau.exemple.fr:8443/rejoindre#K7M4QP",
      "https://carreau.exemple.fr.pirate.exemple/rejoindre#K7M4QP",
      "javascript:alert(1)//#K7M4QP",
      "data:text/html,<h1>x</h1>#K7M4QP",
    ]) {
      expect(codeDepuisQr(texte, ORIGINE)).toBeNull();
    }
  });

  it("refuse un autre chemin, un fragment vide ou illisible", () => {
    for (const texte of [
      "https://carreau.exemple.fr/#K7M4QP",
      "https://carreau.exemple.fr/connexion#K7M4QP",
      "https://carreau.exemple.fr/rejoindre/x#K7M4QP",
      "https://carreau.exemple.fr/rejoindre",
      "https://carreau.exemple.fr/rejoindre#",
      "https://carreau.exemple.fr/rejoindre#%E0%A4%A",
    ]) {
      expect(codeDepuisQr(texte, ORIGINE)).toBeNull();
    }
  });

  it("refuse ce qui n'est pas une adresse ou un code plausible", () => {
    for (const texte of [
      "",
      "K7M4QP",
      "https://carreau.exemple.fr/rejoindre#K7M4QP<script>",
      `https://carreau.exemple.fr/rejoindre#${"A".repeat(13)}`,
      "https://carreau.exemple.fr/rejoindre#K7M-4QP",
    ]) {
      expect(codeDepuisQr(texte, ORIGINE)).toBeNull();
    }
  });

  it("parle à l'étudiant sans l'accuser (décision D5)", () => {
    expect(MESSAGE_QR_ETRANGER).toBe(
      "Ce QR code ne mène pas à un examen Carreau : scanne celui projeté au tableau.",
    );
    expect(MESSAGE_SANS_CAMERA).toBe("Aucune caméra n’est disponible : saisis le code affiché au tableau.");
    expect(MESSAGE_CAMERA_REFUSEE).toBe(
      "Carreau n’a pas accès à la caméra : autorise-la dans les réglages du navigateur, ou saisis le code affiché au tableau.",
    );
  });
});
