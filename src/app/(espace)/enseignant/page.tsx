import type { Metadata } from "next";
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
          La création des classes, des QCM et des sessions arrive avec les prochaines versions de Carreau.
        </p>
      </section>
    </>
  );
}
