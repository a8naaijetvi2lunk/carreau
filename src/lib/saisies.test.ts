import { describe, expect, it } from "vitest";
import {
  MOT_DE_PASSE_MAX,
  MOT_DE_PASSE_MIN,
  schemaCodeTotp,
  schemaEmail,
  schemaIdentifiant,
  schemaIp,
  schemaJeton,
  schemaMotDePasseSaisi,
  schemaNom,
  schemaNouveauMotDePasse,
  schemaPrenom,
  schemaRole,
} from "./saisies";

function message(resultat: { success: boolean; error?: { issues: { message: string }[] } }): string {
  return resultat.error?.issues[0]?.message ?? "";
}

describe("schemaEmail", () => {
  it("normalise en minuscules, sans espaces autour", () => {
    expect(schemaEmail.parse("  Claire.Arnaud@Exemple.FR ")).toBe("claire.arnaud@exemple.fr");
  });

  it("exige une adresse", () => {
    expect(message(schemaEmail.safeParse("  "))).toBe("L'adresse email est obligatoire.");
    expect(message(schemaEmail.safeParse(undefined))).toBe("L'adresse email est obligatoire.");
  });

  it("refuse une adresse mal formée ou trop longue", () => {
    expect(message(schemaEmail.safeParse("claire@"))).toBe("L'adresse email n'est pas valide.");
    expect(message(schemaEmail.safeParse(`${"a".repeat(250)}@exemple.fr`))).toBe(
      "L'adresse email est trop longue.",
    );
  });
});

describe("mots de passe", () => {
  it("un nouveau mot de passe fait de 12 à 128 caractères", () => {
    expect(schemaNouveauMotDePasse.safeParse("a".repeat(MOT_DE_PASSE_MIN)).success).toBe(true);
    expect(message(schemaNouveauMotDePasse.safeParse("a".repeat(MOT_DE_PASSE_MIN - 1)))).toBe(
      "Le mot de passe doit contenir au moins 12 caractères.",
    );
    expect(message(schemaNouveauMotDePasse.safeParse("a".repeat(MOT_DE_PASSE_MAX + 1)))).toBe(
      "Le mot de passe ne doit pas dépasser 128 caractères.",
    );
  });

  it("un mot de passe saisi est seulement borné", () => {
    expect(schemaMotDePasseSaisi.safeParse("x").success).toBe(true);
    expect(message(schemaMotDePasseSaisi.safeParse(""))).toBe("Le mot de passe est obligatoire.");
    expect(schemaMotDePasseSaisi.safeParse("a".repeat(MOT_DE_PASSE_MAX + 1)).success).toBe(false);
  });
});

describe("nom et prénom", () => {
  it("sont nettoyés et bornés", () => {
    expect(schemaNom.parse("  Arnaud ")).toBe("Arnaud");
    expect(message(schemaNom.safeParse(" "))).toBe("Le nom est obligatoire.");
    expect(message(schemaPrenom.safeParse("a".repeat(101)))).toBe("Le prénom est trop long.");
  });

  it("refusent les caractères de contrôle", () => {
    expect(message(schemaNom.safeParse("Arn\u0000aud"))).toBe(
      "Le nom contient des caractères non autorisés.",
    );
  });
});

describe("autres saisies", () => {
  it("le code TOTP tolère les espaces et exige 6 chiffres", () => {
    expect(schemaCodeTotp.parse(" 123 456 ")).toBe("123456");
    expect(message(schemaCodeTotp.safeParse("12345"))).toBe("Le code comporte 6 chiffres.");
    expect(message(schemaCodeTotp.safeParse(undefined))).toBe("Le code est obligatoire.");
  });

  it("un jeton de lien a le format base64url de 43 caractères", () => {
    expect(schemaJeton.safeParse("A".repeat(43)).success).toBe(true);
    expect(message(schemaJeton.safeParse("A".repeat(10)))).toBe("Lien invalide.");
  });

  it("identifiant, IP et rôle", () => {
    expect(schemaIdentifiant.safeParse("11111111-1111-4111-8111-111111111111").success).toBe(true);
    expect(message(schemaIdentifiant.safeParse("1"))).toBe("Identifiant invalide.");
    expect(schemaIp.parse(" 10.0.0.1 ")).toBe("10.0.0.1");
    expect(schemaIp.safeParse("").success).toBe(false);
    expect(schemaRole.safeParse("admin").success).toBe(true);
    expect(message(schemaRole.safeParse("root"))).toBe("Rôle inconnu.");
  });
});
