/** Avant chaque fichier d'intégration : variables de .env, puis base isolée (copie de la base modèle), supprimée à la fin. */
import { utiliserBaseIsolee } from "./base-isolee";
import { appliquerFichierEnv } from "./env-fichier";

appliquerFichierEnv();
utiliserBaseIsolee();
