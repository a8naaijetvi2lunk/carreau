import type { Metadata } from "next";
import { ParcoursEntree } from "./ParcoursEntree";

export const metadata: Metadata = { title: "Rejoindre un examen" };

/**
 * Parcours de l'étudiant (décision D19) : tout se joue dans le navigateur, face aux routes d'API. Le
 * code du QR code arrive dans le fragment (`/rejoindre#K7M4QP`), jamais dans l'URL envoyée au serveur.
 */
export default function PageRejoindre() {
  return <ParcoursEntree />;
}
