/** Envoi d'une image par l'éditeur (route POST /api/enseignant/images, décision D14 du plan du lot 3). */
import { MESSAGES_IMAGE, TAILLE_MAX_IMAGE_OCTETS, type ImageVue } from "@/lib/images";

const ECHEC_ENVOI = "L’envoi de l’image a échoué : vérifie ta connexion, puis réessaie.";

export type ResultatEnvoiImage = { ok: true; image: ImageVue } | { ok: false; message: string };

/** Envoie les octets bruts du fichier ; le serveur décide du format sur ces octets. */
export async function envoyerImage(fichier: File): Promise<ResultatEnvoiImage> {
  if (fichier.size === 0) return { ok: false, message: MESSAGES_IMAGE.vide };
  if (fichier.size > TAILLE_MAX_IMAGE_OCTETS) return { ok: false, message: MESSAGES_IMAGE.tropLourde };
  try {
    const reponse = await fetch("/api/enseignant/images", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: fichier,
    });
    const corps = (await reponse.json()) as { image?: ImageVue; erreur?: { message?: string } };
    if (reponse.ok && corps.image) return { ok: true, image: corps.image };
    return { ok: false, message: corps.erreur?.message ?? ECHEC_ENVOI };
  } catch {
    return { ok: false, message: ECHEC_ENVOI };
  }
}
