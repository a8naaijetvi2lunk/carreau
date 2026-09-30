import { describe, expect, it } from "vitest";
import { libelleDuree, libelleNote, libelleRattrapagePrevu } from "./libelles";

describe("libellés des résultats", () => {
  it("note, durée et absence", () => {
    expect(libelleNote({ statut: "present", note: 14.5 })).toBe("14,5");
    expect(libelleNote({ statut: "en_cours", note: null })).toBe("En cours");
    expect(libelleNote({ statut: "absent", note: null })).toBe("Absent");
    expect(libelleDuree(842)).toBe("14 min 2 s");
    expect(libelleDuree(null)).toBe("—");
  });

  it("rattrapage prévu avec ou sans créneau, ou en cours", () => {
    expect(
      libelleRattrapagePrevu({
        sessionId: "s",
        statut: "attente",
        creneauPrevuLe: "2026-09-30T08:00:00.000Z",
      }),
    ).toBe("Rattrapage prévu le 30/09/2026 10:00");
    expect(libelleRattrapagePrevu({ sessionId: "s", statut: "attente", creneauPrevuLe: null })).toBe(
      "Rattrapage prévu",
    );
    expect(libelleRattrapagePrevu({ sessionId: "s", statut: "en_cours", creneauPrevuLe: null })).toBe(
      "Rattrapage en cours",
    );
  });
});
