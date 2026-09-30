import type { MetadataRoute } from "next";

/**
 * Manifeste de l'application installable (spec §1.1 ; décision D3 du plan du lot 9). Installée, elle
 * s'ouvre sur « Rejoindre un examen », avec le scanner du QR code ; l'installation reste facultative.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Carreau",
    short_name: "Carreau",
    description: "Des QCM sur téléphone, en classe, pour des examens équitables.",
    lang: "fr",
    dir: "ltr",
    start_url: "/rejoindre",
    scope: "/",
    display: "standalone",
    background_color: "#f4f1ea",
    theme_color: "#f4f1ea",
    categories: ["education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
