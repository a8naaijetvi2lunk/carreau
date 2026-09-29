import { LienBouton } from "@/components/ui";

/** Lien d'invitation ou de réinitialisation inconnu, expiré ou déjà utilisé. */
export function LienInutilisable({ titre, texte }: { titre: string; texte: string }) {
  return (
    <>
      <h1 className="font-titre text-3xl font-extrabold tracking-tight">{titre}</h1>
      <p className="text-encre-2">{texte}</p>
      <div>
        <LienBouton href="/connexion" variante="secondaire">
          Aller à la connexion
        </LienBouton>
      </div>
    </>
  );
}
