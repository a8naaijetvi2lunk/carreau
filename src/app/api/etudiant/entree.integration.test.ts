import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { definirHorlogePourLesTests, horlogeFixe } from "@/lib/horloge";
import { nomsCookiesEntree } from "@/modules/sessions";
import { examenEnCours, identifiants } from "@/test/examen";
import { INSTANT_CODE_TEST, preparerSession, renseignerRgpd, SECRET_CODE_TEST } from "@/test/sessions";
import { POST as etat } from "./etat/route";
import { POST as evenements } from "./evenements/route";
import { POST as information } from "./information/route";
import { POST as recherche } from "./recherche/route";
import { POST as reclamer } from "./reclamer/route";
import { POST as rejoindre } from "./rejoindre/route";
import { POST as reponse } from "./reponse/route";
import { POST as selection } from "./selection/route";

beforeEach(() => definirHorlogePourLesTests(horlogeFixe(INSTANT_CODE_TEST)));
afterEach(() => definirHorlogePourLesTests());

function requete(
  chemin: string,
  corps: unknown,
  cookies: Record<string, string> = {},
  type = "application/json",
): Request {
  const cookie = Object.entries(cookies)
    .map(([nom, valeur]) => `${nom}=${valeur}`)
    .join("; ");
  return new Request(`http://localhost/api/etudiant/${chemin}`, {
    method: "POST",
    headers: { "content-type": type, "x-real-ip": "203.0.113.9", ...(cookie ? { cookie } : {}) },
    body: typeof corps === "string" ? corps : JSON.stringify(corps),
  });
}

/** Valeur d'un cookie posé par la réponse. */
function cookiePose(reponse: Response, nom: string): string | undefined {
  const ligne = reponse.headers.getSetCookie().find((c) => c.startsWith(`${nom}=`));
  return ligne?.slice(nom.length + 1).split(";")[0];
}

describe("routes d'entrée des étudiants", () => {
  it("parcours complet : rejoindre, rechercher, réclamer, information, état", async () => {
    await renseignerRgpd();
    await preparerSession({ codeSecret: SECRET_CODE_TEST });
    const noms = nomsCookiesEntree();

    const r1 = await rejoindre(requete("rejoindre", { code: "3PD 4Y2" }));
    expect(r1.status).toBe(200);
    expect(r1.headers.get("cache-control")).toBe("no-store");
    await expect(r1.json()).resolves.toMatchObject({ etape: "nom" });
    expect(r1.headers.getSetCookie()[0]).toMatch(/; Path=\/; HttpOnly; SameSite=Lax; Max-Age=600/);
    const ticket = cookiePose(r1, noms.ticket);
    if (!ticket) throw new Error("ticket absent");

    const r2 = await recherche(requete("recherche", { debut: "dupont" }, { [noms.ticket]: ticket }));
    const { etudiants } = (await r2.json()) as { etudiants: { id: string; prenom: string }[] };
    expect(etudiants.map((e) => e.prenom)).toEqual(["Léa"]);
    const lea = etudiants[0];
    if (!lea) throw new Error("étudiante absente");

    const r3 = await reclamer(requete("reclamer", { etudiantId: lea.id }, { [noms.ticket]: ticket }));
    expect(r3.status).toBe(200);
    await expect(r3.json()).resolves.toMatchObject({ etape: "information", prenom: "Léa" });
    expect(r3.headers.getSetCookie()[0]).toMatch(/Max-Age=2592000/);
    const jeton = cookiePose(r3, noms.appareil);
    if (!jeton) throw new Error("jeton absent");

    const cookies = { [noms.ticket]: ticket, [noms.appareil]: jeton };
    const r4 = await information(requete("information", {}, cookies));
    await expect(r4.json()).resolves.toMatchObject({ etape: "attente", connectes: 1 });

    const r5 = await etat(requete("etat", {}, cookies));
    await expect(r5.json()).resolves.toMatchObject({ etape: "attente", prenom: "Léa" });
    expect(r5.headers.getSetCookie()).toEqual([]);
  });

  it("sans cookie : l'état est l'étape du code ; la réclamation répond 409 avec la raison", async () => {
    await expect((await etat(requete("etat", {}))).json()).resolves.toMatchObject({ etape: "code" });
    const reponse = await reclamer(requete("reclamer", { etudiantId: "x" }));
    expect(reponse.status).toBe(409);
    await expect(reponse.json()).resolves.toMatchObject({
      erreur: { code: "ETAT", details: { raison: "ticket" } },
    });
  });

  it("refuse un corps qui n'est pas du JSON, trop lourd ou inattendu (422)", async () => {
    expect(
      (await rejoindre(requete("rejoindre", "code=K7M4QP", {}, "application/x-www-form-urlencoded"))).status,
    ).toBe(422);
    expect((await rejoindre(requete("rejoindre", { code: "x".repeat(2000) }))).status).toBe(422);
    expect((await etat(requete("etat", { inattendu: 1 }))).status).toBe(422);
  });

  it("un code faux répond 422 avec le message à afficher", async () => {
    const reponse = await rejoindre(requete("rejoindre", { code: "AAAAAA" }));
    expect(reponse.status).toBe(422);
    await expect(reponse.json()).resolves.toMatchObject({
      erreur: { message: "Code inconnu ou expiré : saisis le code affiché en ce moment au tableau." },
    });
  });
});

describe("routes du passage de l'examen", () => {
  const horloge = horlogeFixe(INSTANT_CODE_TEST);
  beforeEach(() => {
    horloge.fixer(INSTANT_CODE_TEST);
    definirHorlogePourLesTests(horloge);
  });

  it("enregistre la sélection, valide, puis donne l'écran de fin, en no-store", async () => {
    const x = await examenEnCours(horloge, { etudiants: [{ nom: "Dupont", prenom: "Léa" }] });
    const lea = x.telephones[0];
    if (!lea) throw new Error("téléphone absent");
    const cookies = { [nomsCookiesEntree().appareil]: lea.jeton };
    const oui = await identifiants(lea.participation.id, 1, ["Oui"]);

    const r1 = await selection(requete("selection", { rang: 1, selection: oui }, cookies));
    expect(r1.status).toBe(200);
    expect(r1.headers.get("cache-control")).toBe("no-store");
    await expect(r1.json()).resolves.toEqual({ enregistree: true });

    const r2 = await etat(requete("etat", {}, cookies));
    await expect(r2.json()).resolves.toMatchObject({ etape: "question", selection: oui });

    const r3 = await reponse(requete("reponse", { rang: 1, selection: oui }, cookies));
    await expect(r3.json()).resolves.toMatchObject({ etape: "question", question: { rang: 2 } });
    const r4 = await reponse(requete("reponse", { rang: 2, selection: [] }, cookies));
    const fin = (await r4.json()) as Record<string, unknown>;
    expect(fin).toMatchObject({ etape: "fin", repondues: 1, total: 2, note: 10 });
    expect(JSON.stringify(fin)).not.toContain("correcte");
  });

  it("refuse un téléphone sans participation (409) et une sélection mal formée (422)", async () => {
    const x = await examenEnCours(horloge, { etudiants: [{ nom: "Dupont", prenom: "Léa" }] });
    const lea = x.telephones[0];
    if (!lea) throw new Error("téléphone absent");
    const sans = await reponse(requete("reponse", { rang: 1, selection: [] }));
    expect(sans.status).toBe(409);
    const cookies = { [nomsCookiesEntree().appareil]: lea.jeton };
    expect((await selection(requete("selection", { rang: 1, selection: ["x"] }, cookies))).status).toBe(422);
    expect((await selection(requete("selection", { rang: 1 }, cookies))).status).toBe(422);
    expect((await reponse(requete("reponse", { rang: 1, selection: [], plus: 1 }, cookies))).status).toBe(
      422,
    );
    const rangFutur = await reponse(requete("reponse", { rang: 2, selection: [] }, cookies));
    expect(rangFutur.status).toBe(409);
  });

  it("reçoit les événements (no-store), refuse un corps mal formé ou trop gros (422)", async () => {
    const x = await examenEnCours(horloge, { etudiants: [{ nom: "Dupont", prenom: "Léa" }] });
    const lea = x.telephones[0];
    if (!lea) throw new Error("téléphone absent");
    const cookies = { [nomsCookiesEntree().appareil]: lea.jeton };
    const lot = { chargement: "chargement-a1", evenements: [{ n: 1, type: "masquee" }] };
    const r1 = await evenements(requete("evenements", lot, cookies));
    expect(r1.status).toBe(200);
    expect(r1.headers.get("cache-control")).toBe("no-store");
    await expect(r1.json()).resolves.toEqual({ enregistres: 1 });
    expect((await evenements(requete("evenements", lot))).status).toBe(409);
    expect(
      (await evenements(requete("evenements", { ...lot, evenements: [{ n: 1, type: "silence" }] }, cookies)))
        .status,
    ).toBe(422);
    expect((await evenements(requete("evenements", { ...lot, le: 1 }, cookies))).status).toBe(422);
    const gros = { chargement: "x".repeat(5_000), evenements: [{ n: 1, type: "copie" }] };
    expect((await evenements(requete("evenements", gros, cookies))).status).toBe(422);
  });
});
