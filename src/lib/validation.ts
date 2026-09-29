/** Validation des saisies de service, partagée par les modules. */
import { z, type ZodType } from "zod";
import { erreurDepuisZod, erreurs } from "./erreurs";

const SCHEMA_UUID = z.uuid();

/** Saisie validée par `schema`, ou ErreurService VALIDATION détaillée. */
export function valider<T>(schema: ZodType<T>, saisie: unknown, contexte: string): T {
  const resultat = schema.safeParse(saisie);
  if (!resultat.success) throw erreurDepuisZod(resultat.error, contexte);
  return resultat.data;
}

/**
 * Identifiant d'une URL ou d'un formulaire, en minuscules (forme de PostgreSQL et des noms de fichier) :
 * mal formé, il désigne une ressource introuvable (404, sans journal).
 */
export function lireIdentifiant(valeur: string, quoi: string): string {
  const resultat = SCHEMA_UUID.safeParse(valeur);
  if (!resultat.success) throw erreurs.introuvable(quoi);
  return resultat.data.toLowerCase();
}
