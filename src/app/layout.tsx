import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

// Polices téléchargées au build et servies par l'application : aucune requête
// vers Google à l'exécution (CSP font-src 'self').
const policeTitre = Bricolage_Grotesque({ subsets: ["latin"], variable: "--police-titre", display: "swap" });
const policeTexte = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--police-texte",
  display: "swap",
});
const policeCode = JetBrains_Mono({ subsets: ["latin"], variable: "--police-code", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Carreau", template: "%s · Carreau" },
  description: "Des QCM sur téléphone, en classe, pour des examens équitables.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4f1ea",
};

export default async function RacineLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Le nonce CSP change à chaque requête (src/proxy.ts) : lire `headers()` force le rendu
  // dynamique, sans quoi une page prérendue porterait un nonce figé, refusé par la CSP.
  await headers();

  return (
    <html lang="fr" className={`${policeTitre.variable} ${policeTexte.variable} ${policeCode.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
