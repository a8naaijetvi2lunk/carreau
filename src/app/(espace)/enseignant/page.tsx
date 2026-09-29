import type { Metadata } from "next";
import { LienBouton } from "@/components/ui";
import { executerPage } from "@/lib/page";
import { exigerActeur } from "@/modules/auth";

export const metadata: Metadata = { title: "Accueil" };

export default async function AccueilEnseignant() {
  const acteur = await executerPage(() => exigerActeur());
  return (
    <>
      <h1 className="font-titre text-4xl leading-[1.05] font-extrabold tracking-tight">
        Bonjour {acteur.prenom}
      </h1>
      <section
        aria-labelledby="bienvenue"
        className="flex max-w-2xl flex-col gap-2 rounded-2xl border border-ligne bg-carte p-5"
      >
        <h2 id="bienvenue" className="text-lg font-bold">
          Ton compte est prêt
        </h2>
        <p className="text-encre-2">
          Écris tes QCM et crée tes classes : le lancement des sessions d’examen arrive avec la prochaine
          version de Carreau.
        </p>
        <div className="flex flex-wrap gap-2">
          <LienBouton href="/enseignant/qcm">Mes QCM</LienBouton>
          <LienBouton href="/enseignant/classes" variante="secondaire">
            Mes classes
          </LienBouton>
        </div>
      </section>
    </>
  );
}
