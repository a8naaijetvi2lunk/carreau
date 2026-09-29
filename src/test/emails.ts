/** Emails dans les tests d'intégration : configuration fictive et transport qui capture les envois. */
import { db } from "@/db";
import { parametres } from "@/db/schema";
import { chiffrer } from "@/lib/chiffrement";
import {
  definirTransportEmailPourLesTests,
  type EnvoiTransport,
  type ResultatTransport,
} from "@/modules/emails";

export const CLE_RESEND_TEST = "re_test_cle_fictive";

/** Paramètres d'envoi complets (clé fictive), comme après leur saisie par le super-admin. */
export async function configurerEnvoi(): Promise<void> {
  const valeurs = {
    resendCleChiffree: chiffrer(CLE_RESEND_TEST),
    emailExpediteur: "invitations@exemple.fr",
    nomExpediteur: "Carreau",
  };
  await db()
    .insert(parametres)
    .values({ id: 1, ...valeurs })
    .onConflictDoUpdate({ target: parametres.id, set: valeurs });
}

/** Remplace Resend : chaque envoi est capturé, le résultat est imposé. */
export function capturerEmails(
  resultat: ResultatTransport = { ok: true, id: "email-test" },
): EnvoiTransport[] {
  const envois: EnvoiTransport[] = [];
  definirTransportEmailPourLesTests(async (envoi) => {
    envois.push(envoi);
    return resultat;
  });
  return envois;
}

/** Jeton du lien `/<chemin>/<jeton>` d'un email capturé. */
export function jetonDuLien(
  envoi: EnvoiTransport | undefined,
  chemin: "activation" | "reinitialisation",
): string {
  const trouve = envoi?.texte.match(new RegExp(`/${chemin}/([A-Za-z0-9_-]{43})`));
  if (!trouve?.[1]) throw new Error(`Aucun lien /${chemin}/ dans l'email`);
  return trouve[1];
}
