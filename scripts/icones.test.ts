import { describe, expect, it } from "vitest";
import { encoderIco } from "./icones.mjs";

describe("encoderIco", () => {
  it("écrit l'en-tête ICO, une entrée par image puis les PNG bout à bout", () => {
    const petite = Buffer.from([1, 2, 3]);
    const grande = Buffer.from([4, 5]);
    const ico = encoderIco([
      { taille: 16, png: petite },
      { taille: 256, png: grande },
    ]);
    // En-tête : réservé 0, type 1 (icône), 2 images.
    expect([...ico.subarray(0, 6)]).toEqual([0, 0, 1, 0, 2, 0]);
    // Première entrée : 16 × 16, 1 plan, 32 bits, 3 octets, données à l'octet 38 (6 + 2 × 16).
    expect(ico.readUInt8(6)).toBe(16);
    expect(ico.readUInt8(7)).toBe(16);
    expect(ico.readUInt16LE(10)).toBe(1);
    expect(ico.readUInt16LE(12)).toBe(32);
    expect(ico.readUInt32LE(14)).toBe(3);
    expect(ico.readUInt32LE(18)).toBe(38);
    // Seconde entrée : 256 s'écrit 0 ; 2 octets, juste après la première image.
    expect(ico.readUInt8(22)).toBe(0);
    expect(ico.readUInt8(23)).toBe(0);
    expect(ico.readUInt32LE(30)).toBe(2);
    expect(ico.readUInt32LE(34)).toBe(41);
    expect([...ico.subarray(38)]).toEqual([1, 2, 3, 4, 5]);
  });
});
