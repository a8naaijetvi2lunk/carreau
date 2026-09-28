import { LienBouton } from "@/components/ui";

export default function PageIntrouvable() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-5 py-12">
      <h1 className="font-titre text-3xl font-extrabold tracking-tight">Page introuvable</h1>
      <p className="text-encre-2">Cette page n’existe pas ou n’est plus disponible.</p>
      <div>
        <LienBouton href="/">Revenir à l’accueil</LienBouton>
      </div>
    </main>
  );
}
