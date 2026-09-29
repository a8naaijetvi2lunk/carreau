/**
 * Images des QCM (spec §4.2, §9.1 et §11.1 ; décisions D1, D14 et D16 du plan du lot 3) :
 * téléversement contrôlé puis ré-encodé, lecture réservée au propriétaire, et à la participation dont
 * la question courante cite l'image (lot 5). Une image n'est jamais supprimée au lot 3.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { count, eq, inArray } from "drizzle-orm";
import { db, type Executeur } from "@/db";
import { image, utilisateur } from "@/db/schema";
import type { ActeurUtilisateur } from "@/lib/acteur";
import { erreurs } from "@/lib/erreurs";
import { maintenant } from "@/lib/horloge";
import { MAX_IMAGES_PAR_COMPTE, MESSAGES_IMAGE, TAILLE_MAX_IMAGE_OCTETS, type ImageVue } from "@/lib/images";
import { lireIdentifiant } from "@/lib/validation";
import { journaliser, journaliserLesRefus } from "@/modules/journal";
import { ecrireFichierImage, lireFichierImage, supprimerFichierImage } from "./stockage";
import { traiterImage } from "./traitement";

async function nombreImages(executeur: Executeur, enseignantId: string): Promise<number> {
  const [ligne] = await executeur
    .select({ total: count() })
    .from(image)
    .where(eq(image.enseignantId, enseignantId));
  return ligne?.total ?? 0;
}

/** Téléverse une image : contrôlée, ré-encodée en WebP, enregistrée sous un identifiant aléatoire. */
export async function televerserImage(
  acteur: ActeurUtilisateur,
  saisie: { octets: Uint8Array },
): Promise<ImageVue> {
  return journaliserLesRefus(acteur, "images.televerser", async () => {
    const { octets } = saisie;
    if (!(octets instanceof Uint8Array) || octets.byteLength === 0) {
      throw erreurs.validation(MESSAGES_IMAGE.vide);
    }
    if (octets.byteLength > TAILLE_MAX_IMAGE_OCTETS) throw erreurs.validation(MESSAGES_IMAGE.tropLourde);
    // Contrôle préalable : inutile de ré-encoder une image qui serait refusée (recontrôlé sous verrou).
    if ((await nombreImages(db(), acteur.id)) >= MAX_IMAGES_PAR_COMPTE) {
      throw erreurs.etat(MESSAGES_IMAGE.limite);
    }
    const traitee = await traiterImage(octets);
    const id = randomUUID();
    await ecrireFichierImage(id, traitee.contenu);
    try {
      await db().transaction(async (tx) => {
        // Sérialise les envois d'un même compte : la limite reste juste en concurrence.
        await tx
          .select({ id: utilisateur.id })
          .from(utilisateur)
          .where(eq(utilisateur.id, acteur.id))
          .for("update");
        if ((await nombreImages(tx, acteur.id)) >= MAX_IMAGES_PAR_COMPTE) {
          throw erreurs.etat(MESSAGES_IMAGE.limite);
        }
        await tx.insert(image).values({
          id,
          enseignantId: acteur.id,
          largeur: traitee.largeur,
          hauteur: traitee.hauteur,
          octets: traitee.contenu.byteLength,
          creeLe: maintenant(),
        });
        await journaliser(
          {
            acteur: { type: "utilisateur", id: acteur.id },
            action: "images.televerser",
            cible: `image:${id}`,
            details: {
              octets: traitee.contenu.byteLength,
              largeur: traitee.largeur,
              hauteur: traitee.hauteur,
            },
          },
          tx,
        );
      });
    } catch (erreur) {
      await supprimerFichierImage(id);
      throw erreur;
    }
    return { id, largeur: traitee.largeur, hauteur: traitee.hauteur };
  });
}

/** Fichier d'une image de l'acteur. Image d'un autre compte : « introuvable », refus journalisé. */
export async function lireImage(
  acteur: ActeurUtilisateur,
  saisie: { imageId: string },
): Promise<{ contenu: Buffer }> {
  return journaliserLesRefus(acteur, "images.lire", async () => {
    const id = lireIdentifiant(saisie.imageId, "Image");
    const [ligne] = await db()
      .select({ enseignantId: image.enseignantId })
      .from(image)
      .where(eq(image.id, id));
    if (!ligne) throw erreurs.introuvable("Image");
    if (ligne.enseignantId !== acteur.id) throw erreurs.ressourceAutrui("Image");
    const contenu = await lireFichierImage(id);
    if (!contenu) {
      // Seul l'identifiant est écrit : aucune donnée personnelle.
      console.error(`[images] Fichier absent du disque : image:${id}`);
      throw erreurs.introuvable("Image");
    }
    return { contenu };
  });
}

/**
 * Fichier d'une image, **sans contrôle d'accès** : réservé à un appelant qui a déjà vérifié le droit
 * de lecture (image de la question courante d'une participation, décision D12 du plan du lot 5).
 */
export async function contenuImage(imageId: string): Promise<Buffer> {
  const id = lireIdentifiant(imageId, "Image");
  const contenu = await lireFichierImage(id);
  if (!contenu) {
    // Seul l'identifiant est écrit : aucune donnée personnelle.
    console.error(`[images] Fichier absent du disque : image:${id}`);
    throw erreurs.introuvable("Image");
  }
  return contenu;
}

/**
 * Vérifie que chaque image citée (énoncé, réponses) appartient à l'acteur. Appelée par le module
 * `qcm` dans sa transaction ; le refus est journalisé par le service appelant.
 */
export async function verifierImagesDeLActeur(
  executeur: Executeur,
  acteur: ActeurUtilisateur,
  ids: readonly string[],
): Promise<void> {
  const uniques = [...new Set(ids)].map((id) => lireIdentifiant(id, "Image"));
  if (uniques.length === 0) return;
  const lignes = await executeur
    .select({ id: image.id, enseignantId: image.enseignantId })
    .from(image)
    .where(inArray(image.id, uniques));
  for (const id of uniques) {
    const ligne = lignes.find((l) => l.id === id);
    if (!ligne) throw erreurs.introuvable("Image");
    if (ligne.enseignantId !== acteur.id) throw erreurs.ressourceAutrui("Image");
  }
}
