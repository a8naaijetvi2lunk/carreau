import type { Metadata } from "next";
import Link from "next/link";
import { FormulaireMotDePasseOublie } from "./FormulaireMotDePasseOublie";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function PageMotDePasseOublie() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="font-titre text-3xl font-extrabold tracking-tight">Mot de passe oublié</h1>
        <p className="text-encre-2">
          Saisis ton adresse : si un compte y correspond, tu reçois un lien pour choisir un nouveau mot de
          passe. Il reste valable une heure.
        </p>
      </div>
      <FormulaireMotDePasseOublie />
      <Link href="/connexion" className="text-[15px] font-bold text-bleu">
        Revenir à la connexion
      </Link>
    </>
  );
}
