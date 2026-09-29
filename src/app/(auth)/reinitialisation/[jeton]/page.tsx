import type { Metadata } from "next";
import { executerPage } from "@/lib/page";
import { lireLienReinitialisation, MESSAGES_REINITIALISATION } from "@/modules/comptes";
import { LienInutilisable } from "../../LienInutilisable";
import { reinitialiserMotDePasseAction } from "./actions";
import { FormulaireReinitialisation } from "./FormulaireReinitialisation";

// Le lien porte un jeton : jamais transmis à un autre site par l'en-tête Referer.
export const metadata: Metadata = { title: "Nouveau mot de passe", referrer: "no-referrer" };

export default async function PageReinitialisation(props: PageProps<"/reinitialisation/[jeton]">) {
  const { jeton } = await props.params;
  const etat = await executerPage(() => lireLienReinitialisation(jeton));
  if (!etat) {
    return (
      <LienInutilisable
        titre="Lien invalide"
        texte="Ce lien n’existe pas ou n’est plus valable. Fais une nouvelle demande depuis la page de connexion."
      />
    );
  }
  if (etat !== "valide")
    return <LienInutilisable titre="Lien inutilisable" texte={MESSAGES_REINITIALISATION[etat]} />;

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="font-titre text-3xl font-extrabold tracking-tight">Nouveau mot de passe</h1>
        <p className="text-encre-2">
          Choisis un nouveau mot de passe. Tes sessions ouvertes seront fermées ; ta double authentification
          ne change pas.
        </p>
      </div>
      <FormulaireReinitialisation action={reinitialiserMotDePasseAction.bind(null, jeton)} />
    </>
  );
}
