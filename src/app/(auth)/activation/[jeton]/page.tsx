import type { Metadata } from "next";
import { LIBELLES_ROLE } from "@/lib/acteur";
import { executerPage } from "@/lib/page";
import { lireInvitation, MESSAGES_INVITATION } from "@/modules/comptes";
import { LienInutilisable } from "../../LienInutilisable";
import { activerCompteAction } from "./actions";
import { FormulaireActivation } from "./FormulaireActivation";

// Le lien porte un jeton : jamais transmis à un autre site par l'en-tête Referer.
export const metadata: Metadata = { title: "Activer mon compte", referrer: "no-referrer" };

export default async function PageActivation(props: PageProps<"/activation/[jeton]">) {
  const { jeton } = await props.params;
  const invitation = await executerPage(() => lireInvitation(jeton));
  if (!invitation) {
    return (
      <LienInutilisable
        titre="Lien invalide"
        texte="Ce lien d’activation n’existe pas. Vérifie qu’il a été copié en entier."
      />
    );
  }
  if (invitation.etat !== "valide") {
    return <LienInutilisable titre="Lien inutilisable" texte={MESSAGES_INVITATION[invitation.etat]} />;
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="font-titre text-3xl font-extrabold tracking-tight">Activer mon compte</h1>
        <p className="text-encre-2">
          Compte <strong>{invitation.email}</strong>, rôle {LIBELLES_ROLE[invitation.role].toLowerCase()}.
          Choisis ton mot de passe ; tu configureras ensuite la double authentification.
        </p>
      </div>
      <FormulaireActivation action={activerCompteAction.bind(null, jeton)} />
    </>
  );
}
