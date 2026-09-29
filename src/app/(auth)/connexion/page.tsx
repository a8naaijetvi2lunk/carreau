import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alerte } from "@/components/ui";
import { executerPage } from "@/lib/page";
import { acteurCourant, sessionEnAttenteCourante } from "@/modules/auth";
import { FormulaireConnexion } from "./FormulaireConnexion";

export const metadata: Metadata = { title: "Connexion" };

export default async function PageConnexion(props: PageProps<"/connexion">) {
  const { acteur, enAttente } = await executerPage(async () => ({
    acteur: await acteurCourant(),
    enAttente: await sessionEnAttenteCourante(),
  }));
  if (acteur) redirect("/enseignant");
  if (enAttente) redirect("/connexion/double-authentification");
  const { motDePasse } = await props.searchParams;

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="font-titre text-3xl font-extrabold tracking-tight">Connexion</h1>
        <p className="text-encre-2">Espace des enseignants et de l’administration.</p>
      </div>
      {motDePasse === "modifie" ? (
        <Alerte ton="succes">Mot de passe modifié : connecte-toi avec le nouveau.</Alerte>
      ) : null}
      <FormulaireConnexion />
      <Link href="/mot-de-passe-oublie" className="text-[15px] font-bold text-bleu">
        Mot de passe oublié ?
      </Link>
    </>
  );
}
