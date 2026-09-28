"use client";

import { Bouton, LienBouton } from "@/components/ui";

/*
 * Erreur inattendue pendant l'affichage. Aucun message technique : seule la référence
 * (digest) est montrée, elle permet de retrouver l'erreur dans les journaux du serveur.
 */
export default function PageErreur({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-5 py-12">
      <h1 className="font-titre text-3xl font-extrabold tracking-tight">Une erreur est survenue</h1>
      <p className="text-encre-2">
        La page n’a pas pu s’afficher. Réessaie dans un instant ; si le problème continue, préviens ton
        enseignant.
      </p>
      {error.digest ? <p className="text-sm text-muet">Référence : {error.digest}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Bouton onClick={() => reset()}>Réessayer</Bouton>
        <LienBouton href="/" variante="secondaire">
          Revenir à l’accueil
        </LienBouton>
      </div>
    </main>
  );
}
