import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Bouton } from "@/components/ui";
import { executerPage } from "@/lib/page";
import { jetonSessionCourant, preparerDoubleAuth } from "@/modules/auth";
import { abandonnerDoubleAuthAction } from "./actions";
import { FormulaireDoubleAuth } from "./FormulaireDoubleAuth";

export const metadata: Metadata = { title: "Double authentification" };

export default async function PageDoubleAuthentification() {
  const ecran = await executerPage(async () => {
    const jeton = await jetonSessionCourant();
    return jeton ? preparerDoubleAuth(jeton) : null;
  });
  if (!ecran) redirect("/connexion");

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="font-titre text-3xl font-extrabold tracking-tight">Double authentification</h1>
        <p className="text-encre-2">
          Compte : <strong>{ecran.email}</strong>
        </p>
      </div>
      {ecran.mode === "enrolement" ? (
        <section
          aria-labelledby="configurer"
          className="flex flex-col gap-4 rounded-2xl border border-ligne bg-carte p-5"
        >
          <h2 id="configurer" className="text-lg font-bold">
            Configure ton application d’authentification
          </h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px] text-encre-2">
            <li>Installe une application comme Google Authenticator, Microsoft Authenticator ou FreeOTP.</li>
            <li>Scanne ce QR code avec l’application, ou saisis la clé de configuration.</li>
            <li>Saisis ci-dessous le code à 6 chiffres qu’elle affiche.</li>
          </ol>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR code en URI data:, rien à optimiser */}
          <img
            src={ecran.qrCode}
            alt="QR code de configuration de la double authentification"
            width={200}
            height={200}
            className="self-center rounded-lg bg-blanc"
          />
          <p className="text-[15px]">
            Clé de configuration : <code className="font-code text-sm break-all">{ecran.cleManuelle}</code>
          </p>
          <a href={ecran.uri} className="text-[15px] font-bold text-bleu">
            Ouvrir dans l’application d’authentification
          </a>
        </section>
      ) : (
        <p className="text-encre-2">
          Saisis le code à 6 chiffres affiché par ton application d’authentification.
        </p>
      )}
      <FormulaireDoubleAuth />
      <form action={abandonnerDoubleAuthAction}>
        <Bouton type="submit" variante="secondaire" className="w-full">
          Annuler et revenir à la connexion
        </Bouton>
      </form>
    </>
  );
}
