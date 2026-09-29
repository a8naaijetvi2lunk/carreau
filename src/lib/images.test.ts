import { describe, expect, it } from "vitest";
import { MESSAGES_IMAGE, TAILLE_MAX_IMAGE_OCTETS, urlImage } from "./images";

describe("images", () => {
  it("donne l'adresse de lecture contrôlée d'une image", () => {
    expect(urlImage("3f2b8c1e-0000-4000-8000-000000000001")).toBe(
      "/api/images/3f2b8c1e-0000-4000-8000-000000000001",
    );
  });

  it("borne l'entrée à 5 Mo et l'annonce dans les messages", () => {
    expect(TAILLE_MAX_IMAGE_OCTETS).toBe(5 * 1024 * 1024);
    expect(MESSAGES_IMAGE.tropLourde).toBe("Image trop lourde : 5 Mo au maximum.");
    expect(MESSAGES_IMAGE.limite).toBe("Tu as atteint la limite de 2000 images.");
  });
});
