import { describe, expect, it } from "vitest";
import {
  FORMAT_JETON_MCP,
  LIBELLES_PORTEE_MCP,
  LIMITES_JETONS_MCP,
  lireJetonBearer,
  MESSAGE_LIMITE_JETONS,
  OCTETS_MAX_CORPS_MCP,
  PORTEES_MCP,
  prefixeJetonMcp,
  REGLE_LIMITE_MCP,
} from "./regles-mcp";

const JETON = `carreau_${"A".repeat(20)}-_${"z9".repeat(10)}1`;

describe("jetons MCP", () => {
  it("reconnaît un jeton carreau_ de 43 caractères base64url (spec §10)", () => {
    expect(JETON).toHaveLength(51);
    expect(FORMAT_JETON_MCP.test(JETON)).toBe(true);
    expect(FORMAT_JETON_MCP.test(JETON.slice(0, -1))).toBe(false);
    expect(FORMAT_JETON_MCP.test(`${JETON}x`)).toBe(false);
    expect(FORMAT_JETON_MCP.test(JETON.replace("carreau_", "iuttc_ab"))).toBe(false);
    expect(FORMAT_JETON_MCP.test(JETON.replace("A", "="))).toBe(false);
  });

  it("garde les 12 premiers caractères pour reconnaître un jeton dans la liste", () => {
    expect(prefixeJetonMcp(JETON)).toBe("carreau_AAAA");
  });

  it("fixe les portées, les bornes et la limite de débit (spec §10 et §11.2)", () => {
    expect(PORTEES_MCP).toEqual(["lecture", "ecriture"]);
    expect(LIBELLES_PORTEE_MCP).toEqual({ lecture: "Lecture seule", ecriture: "Lecture et écriture" });
    expect(LIMITES_JETONS_MCP).toEqual({ nomMax: 60, actifsMax: 10 });
    expect(REGLE_LIMITE_MCP).toEqual({ seuil: 60, fenetreSecondes: 60, blocageSecondes: 60 });
    expect(OCTETS_MAX_CORPS_MCP).toBe(524288);
    expect(MESSAGE_LIMITE_JETONS).toBe("Tu as déjà 10 jetons actifs : révoque celui que tu n'utilises plus.");
  });
});

describe("lireJetonBearer", () => {
  it("lit le jeton d'un en-tête Bearer, sans tenir compte de la casse ni des espaces", () => {
    expect(lireJetonBearer(`Bearer ${JETON}`)).toBe(JETON);
    expect(lireJetonBearer(`bearer   ${JETON}`)).toBe(JETON);
    expect(lireJetonBearer(`BEARER\t${JETON} `)).toBe(JETON);
  });

  it("renvoie null sans en-tête, pour un autre schéma ou un jeton mal formé", () => {
    for (const entete of [
      null,
      "",
      JETON,
      `Basic ${JETON}`,
      "Bearer ",
      `Bearer ${JETON} ${JETON}`,
      `Bearer ${JETON.slice(0, -1)}`,
      `Bearer ${"a".repeat(5000)}`,
    ]) {
      expect(lireJetonBearer(entete)).toBeNull();
    }
  });
});
