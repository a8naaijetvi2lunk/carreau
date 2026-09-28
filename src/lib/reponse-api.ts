import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { referenceErreur } from "./action";
import { ErreurService, erreurDepuisZod, erreurs } from "./erreurs";
import { journaliserErreurInattendue } from "./journal-erreur";

const SANS_CACHE = { "Cache-Control": "no-store" } as const;

/** Taille maximale par défaut d'un corps JSON, en octets. */
export const TAILLE_MAX_CORPS_DEFAUT = 64 * 1024;

/** Réponse JSON de succès d'une route d'API, jamais mise en cache. */
export function reponseOk(donnees: unknown, statut = 200): Response {
  return Response.json(donnees, { status: statut, headers: SANS_CACHE });
}

/**
 * Réponse JSON d'erreur d'une route d'API : `{ erreur: { code, message, details? } }`
 * avec le statut de l'erreur. LIMITE_ATTEINTE : en-tête `Retry-After` quand le délai
 * est connu. Erreur inconnue → 500 générique, référence journalisée, jamais de pile.
 * redirect() et notFound() de Next sont relancés.
 */
export function reponseErreur(erreur: unknown): Response {
  unstable_rethrow(erreur);

  if (erreur instanceof ErreurService) {
    const delai = (erreur.details as { reessayerApresSecondes?: unknown } | undefined)
      ?.reessayerApresSecondes;
    const entetes: Record<string, string> =
      erreur.code === "LIMITE_ATTEINTE" && typeof delai === "number" && Number.isFinite(delai) && delai >= 0
        ? { ...SANS_CACHE, "Retry-After": String(Math.ceil(delai)) }
        : { ...SANS_CACHE };
    return Response.json(
      {
        erreur: {
          code: erreur.code,
          message: erreur.message,
          ...(erreur.details !== undefined ? { details: erreur.details } : {}),
        },
      },
      { status: erreur.statutHttp, headers: entetes },
    );
  }

  const reference = referenceErreur();
  journaliserErreurInattendue("api", reference, erreur);
  return Response.json(
    { erreur: { code: "INTERNE", message: `Une erreur inattendue est survenue (réf. ${reference})` } },
    { status: 500, headers: SANS_CACHE },
  );
}

/**
 * Lit et valide le corps JSON d'une requête d'API :
 * - `Content-Type: application/json` exigé (protection CSRF, spec §2) ;
 * - taille bornée, lue en flux (jamais plus de `tailleMax` octets en mémoire) ;
 * - validation par le schéma Zod (utiliser `z.strictObject`).
 */
export async function lireCorpsJson<T>(
  requete: Request,
  schema: z.ZodType<T>,
  contexte: string,
  tailleMax = TAILLE_MAX_CORPS_DEFAUT,
): Promise<T> {
  const type = requete.headers.get("content-type") ?? "";
  if (!/^application\/json\s*(;|$)/i.test(type)) {
    throw erreurs.validation("Le corps de la requête doit être au format JSON.");
  }
  const texte = await lireTexteBorne(requete, tailleMax);
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    throw erreurs.validation("Le corps de la requête n'est pas un JSON valide.");
  }
  const resultat = schema.safeParse(brut);
  if (!resultat.success) throw erreurDepuisZod(resultat.error, contexte);
  return resultat.data;
}

async function lireTexteBorne(requete: Request, tailleMax: number): Promise<string> {
  if (!requete.body) return "";
  const lecteur = requete.body.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.byteLength;
    if (total > tailleMax) {
      await lecteur.cancel();
      throw erreurs.validation("Le corps de la requête est trop volumineux.");
    }
    morceaux.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(morceaux));
}
