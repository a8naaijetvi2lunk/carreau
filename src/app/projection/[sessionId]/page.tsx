import type { Metadata } from "next";
import { executerPage } from "@/lib/page";
import { pluriel } from "@/lib/textes";
import { exigerActeur } from "@/modules/auth";
import { lireSession, projeterSession } from "@/modules/sessions";
import { EcranProjete } from "./EcranProjete";

export const metadata: Metadata = { title: "Écran projeté" };

/**
 * Écran projeté d'une session (amendement A2 du plan du lot 4) : plein écran, hors de la coquille de
 * l'espace enseignant, réservé à la propriétaire de la session (404 sinon, connexion si besoin).
 */
export default async function PageProjection(props: PageProps<"/projection/[sessionId]">) {
  const { sessionId } = await props.params;
  const { acteur, session, vue } = await executerPage(async () => {
    const acteur = await exigerActeur();
    return {
      acteur,
      session: await lireSession(acteur, { sessionId }),
      vue: await projeterSession(acteur, { sessionId }),
    };
  });
  const sousTitre = [
    `Groupe ${session.classe}`,
    `${acteur.prenom} ${acteur.nom}`,
    pluriel(session.examen.questions, "question", "questions"),
    session.examen.duree,
  ].join(" · ");
  return (
    <EcranProjete sessionId={session.id} entete={{ titre: session.titre, sousTitre }} vueInitiale={vue} />
  );
}
