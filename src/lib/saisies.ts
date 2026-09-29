/** Schémas Zod partagés par les comptes : chaque service les compose dans un `z.strictObject`. */
import { z } from "zod";
import { FORMAT_JETON } from "./jetons";
import { ROLES } from "./roles";

export const MOT_DE_PASSE_MIN = 12;
export const MOT_DE_PASSE_MAX = 128;

const SANS_CARACTERE_DE_CONTROLE = /^[^\p{Cc}]*$/u;

/** Adresse email, normalisée (espaces retirés, minuscules) avant validation. */
export const schemaEmail = z
  .string({ error: "L'adresse email est obligatoire." })
  .trim()
  .toLowerCase()
  .min(1, { error: "L'adresse email est obligatoire." })
  .max(254, { error: "L'adresse email est trop longue." })
  .pipe(z.email({ error: "L'adresse email n'est pas valide." }));

/** Mot de passe saisi à la connexion : seulement borné (message générique en cas d'échec). */
export const schemaMotDePasseSaisi = z
  .string({ error: "Le mot de passe est obligatoire." })
  .min(1, { error: "Le mot de passe est obligatoire." })
  .max(MOT_DE_PASSE_MAX, { error: `Le mot de passe ne doit pas dépasser ${MOT_DE_PASSE_MAX} caractères.` });

/** Nouveau mot de passe (activation, réinitialisation) : 12 à 128 caractères (spec §5). */
export const schemaNouveauMotDePasse = z
  .string({ error: "Le mot de passe est obligatoire." })
  .min(MOT_DE_PASSE_MIN, {
    error: `Le mot de passe doit contenir au moins ${MOT_DE_PASSE_MIN} caractères.`,
  })
  .max(MOT_DE_PASSE_MAX, { error: `Le mot de passe ne doit pas dépasser ${MOT_DE_PASSE_MAX} caractères.` });

function texteCourt(libelle: string) {
  return z
    .string({ error: `${libelle} est obligatoire.` })
    .trim()
    .min(1, { error: `${libelle} est obligatoire.` })
    .max(100, { error: `${libelle} est trop long.` })
    .regex(SANS_CARACTERE_DE_CONTROLE, { error: `${libelle} contient des caractères non autorisés.` });
}

export const schemaNom = texteCourt("Le nom");
export const schemaPrenom = texteCourt("Le prénom");

/** Code TOTP : 6 chiffres, espaces tolérés à la saisie. */
export const schemaCodeTotp = z
  .string({ error: "Le code est obligatoire." })
  .transform((valeur) => valeur.replace(/\s/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, { error: "Le code comporte 6 chiffres." }));

/** Jeton d'un lien (invitation, réinitialisation). */
export const schemaJeton = z
  .string({ error: "Lien invalide." })
  .regex(FORMAT_JETON, { error: "Lien invalide." });

export const schemaIdentifiant = z.uuid({ error: "Identifiant invalide." });

/** Adresse IP du client, lue par l'appelant (`lireIpClient`). */
export const schemaIp = z
  .string({ error: "Adresse IP manquante." })
  .trim()
  .min(1, { error: "Adresse IP manquante." })
  .max(100, { error: "Adresse IP invalide." });

export const schemaRole = z.enum(ROLES, { error: "Rôle inconnu." });
