import { describe, expect, it } from "vitest";
import { secretCronValide } from "./secret-cron";

const SECRET = "secret-de-test-des-purges-0123456789abcdef";

describe("secretCronValide (décision D5 du plan du lot 10)", () => {
  it("accepte Bearer suivi du secret exact, quelle que soit la casse du mot Bearer", () => {
    expect(secretCronValide(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(secretCronValide(`bearer ${SECRET}`, SECRET)).toBe(true);
    expect(secretCronValide(`  BEARER\t${SECRET}  `, SECRET)).toBe(true);
  });

  it("refuse tout le reste", () => {
    for (const entete of [
      null,
      "",
      SECRET,
      "Bearer",
      "Bearer ",
      `Basic ${SECRET}`,
      `Bearer ${SECRET}x`,
      `Bearer ${SECRET.slice(0, -1)}`,
      `Bearer ${SECRET} ${SECRET}`,
      `Bearer${SECRET}`,
    ]) {
      expect(secretCronValide(entete, SECRET)).toBe(false);
    }
  });

  it("refuse tout appel quand aucun secret n'est configuré", () => {
    expect(secretCronValide(`Bearer ${SECRET}`, undefined)).toBe(false);
    expect(secretCronValide("Bearer ", undefined)).toBe(false);
    expect(secretCronValide("Bearer x", "")).toBe(false);
  });
});
