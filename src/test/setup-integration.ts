/** Avant chaque fichier d'intégration : variables de .env, puis base isolée (copie de la base modèle), supprimée à la fin. */
import { beforeEach } from "vitest";
import { utiliserBaseIsolee } from "./base-isolee";
import { appliquerFichierEnv } from "./env-fichier";

appliquerFichierEnv();
utiliserBaseIsolee();

// Filet par défaut : un test qui envoie sans avoir capturé (capturerEmails()) atteindrait Resend.
// Import dynamique (pas en tête de fichier) : un import statique chargerait le vrai module
// "resend" avant que le `vi.mock("resend")` d'un fichier de test ne puisse l'intercepter.
beforeEach(async () => {
  const { definirTransportEmailPourLesTests } = await import("@/modules/emails");
  definirTransportEmailPourLesTests(async () => {
    throw new Error("Envoi réel interdit dans les tests : appeler capturerEmails().");
  });
});
