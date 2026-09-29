/**
 * Modèles d'emails, écrits dans le code (spec §9.3, décision de conception n° 9) : invitation,
 * relance, réinitialisation du mot de passe. HTML à styles en ligne (clients mail) et texte brut
 * équivalent. Toute valeur insérée dans le HTML est échappée.
 */
import { LIBELLES_ROLE, type Role } from "@/lib/acteur";
import { formaterDateHeure } from "@/lib/dates";

export type MessageEmail = { sujet: string; texte: string; html: string };

export function echapperHtml(texte: string): string {
  return texte
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

type Contenu = {
  titre: string;
  paragraphes: string[];
  bouton: { libelle: string; lien: string };
  note: string;
};

function composer(sujet: string, contenu: Contenu): MessageEmail {
  const paragraphe = (texte: string) =>
    `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#15171c">${echapperHtml(texte)}</p>`;
  const lien = echapperHtml(contenu.bouton.lien);
  const html = [
    '<!doctype html><html lang="fr"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1"></head>',
    '<body style="margin:0;padding:24px;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif">',
    '<div style="max-width:560px;margin:0 auto;background:#fffdf8;border:1px solid #d9d3c7;border-radius:12px;padding:32px">',
    '<p style="margin:0 0 24px;font-size:20px;font-weight:bold;color:#15171c">Carreau</p>',
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#15171c">${echapperHtml(contenu.titre)}</h1>`,
    ...contenu.paragraphes.map(paragraphe),
    `<p style="margin:24px 0"><a href="${lien}" style="display:inline-block;background:#2344c4;color:#ffffff;`,
    `text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px">${echapperHtml(contenu.bouton.libelle)}</a></p>`,
    '<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#4e5561">',
    `Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>${lien}</p>`,
    `<p style="margin:0;font-size:14px;line-height:1.5;color:#4e5561">${echapperHtml(contenu.note)}</p>`,
    "</div></body></html>",
  ].join("");
  const texte = [
    contenu.titre,
    "",
    ...contenu.paragraphes.flatMap((p) => [p, ""]),
    `${contenu.bouton.libelle} : ${contenu.bouton.lien}`,
    "",
    contenu.note,
  ].join("\n");
  return { sujet, texte, html };
}

export type DonneesInvitation = {
  /** Prénom et nom de la personne qui invite. */
  inviteur: string;
  role: Role;
  lien: string;
  expireLe: Date;
  relance: boolean;
};

export function modeleInvitation(donnees: DonneesInvitation): MessageEmail {
  const role = LIBELLES_ROLE[donnees.role].toLowerCase();
  return composer(
    donnees.relance ? "Rappel : votre invitation à rejoindre Carreau" : "Invitation à rejoindre Carreau",
    {
      titre: donnees.relance ? "Rappel de votre invitation" : "Invitation à rejoindre Carreau",
      paragraphes: [
        `${donnees.inviteur} vous invite à rejoindre Carreau, l'application de QCM de votre établissement, avec le rôle ${role}.`,
        `Ce lien est personnel et ne sert qu'une fois. Il est valable jusqu'au ${formaterDateHeure(donnees.expireLe)} (heure de Paris).`,
        "Vous choisirez un mot de passe, puis configurerez la double authentification avec une application comme Google Authenticator, Microsoft Authenticator ou FreeOTP.",
      ],
      bouton: { libelle: "Activer mon compte", lien: donnees.lien },
      note: donnees.relance
        ? "Ce message remplace l'invitation précédente, dont le lien ne fonctionne plus."
        : "Si vous ne vous attendiez pas à cette invitation, ignorez ce message.",
    },
  );
}

export function modeleReinitialisation(donnees: { lien: string; expireLe: Date }): MessageEmail {
  return composer("Réinitialisation de votre mot de passe Carreau", {
    titre: "Réinitialiser votre mot de passe",
    paragraphes: [
      "Une réinitialisation du mot de passe de votre compte Carreau a été demandée.",
      `Ce lien ne sert qu'une fois et reste valable jusqu'au ${formaterDateHeure(donnees.expireLe)} (heure de Paris). Vos sessions ouvertes seront fermées ; la double authentification reste inchangée.`,
    ],
    bouton: { libelle: "Choisir un nouveau mot de passe", lien: donnees.lien },
    note: "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.",
  });
}

export const MODELES_TEST = ["invitation", "relance", "reinitialisation"] as const;
export type ModeleTest = (typeof MODELES_TEST)[number];

export const LIBELLES_MODELE_TEST: Record<ModeleTest, string> = {
  invitation: "Invitation d'un enseignant",
  relance: "Relance d'invitation",
  reinitialisation: "Réinitialisation du mot de passe",
};

/** Modèle rempli de données fictives, sujet préfixé par « [Test] » (envoi de test, spec §9.3). */
export function modeleTest(modele: ModeleTest, lien: string, instant: Date): MessageEmail {
  const message =
    modele === "reinitialisation"
      ? modeleReinitialisation({ lien, expireLe: new Date(instant.getTime() + 60 * 60 * 1000) })
      : modeleInvitation({
          inviteur: "Claire Arnaud",
          role: "enseignant",
          lien,
          expireLe: new Date(instant.getTime() + 7 * 24 * 60 * 60 * 1000),
          relance: modele === "relance",
        });
  return { ...message, sujet: `[Test] ${message.sujet}` };
}
