import type { Metadata } from "next";
import { Etiquette } from "@/components/ui";
import { executerPage } from "@/lib/page";
import { exigerActeur } from "@/modules/auth";
import { LIBELLES_MODELE_TEST, MODELES_TEST } from "@/modules/emails";
import { lireParametres } from "@/modules/parametres";
import { FormulaireConservation } from "./FormulaireConservation";
import { FormulaireEmailTest } from "./FormulaireEmailTest";
import { FormulaireEnvoi } from "./FormulaireEnvoi";
import { FormulaireValidite } from "./FormulaireValidite";

export const metadata: Metadata = { title: "Paramètres" };

const CARTE = "flex flex-col gap-4 rounded-2xl border border-ligne bg-carte p-5";

export default async function PageParametres() {
  const vue = await executerPage(async () => lireParametres(await exigerActeur()));
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-titre text-4xl leading-[1.05] font-extrabold tracking-tight">Paramètres</h1>
        <Etiquette ton="sombre">Réservé au super-admin</Etiquette>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        <section aria-labelledby="envoi" className={CARTE}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="envoi" className="text-lg font-bold">
              Envoi des emails · Resend
            </h2>
            <Etiquette ton={vue.resendConfiguree ? "bleu" : "neutre"}>
              {vue.resendConfiguree ? "Clé enregistrée" : "Non configuré"}
            </Etiquette>
          </div>
          <FormulaireEnvoi
            resendConfiguree={vue.resendConfiguree}
            emailExpediteur={vue.emailExpediteur ?? ""}
            nomExpediteur={vue.nomExpediteur ?? "Carreau"}
          />
          <div className="flex flex-col gap-3 border-t border-ligne-douce pt-4">
            <h3 className="font-bold">Email de test</h3>
            <p className="text-[15px] text-encre-2">
              Le message part vers ton adresse, avec un sujet préfixé par « [Test] ». Les modèles sont écrits
              dans le code de Carreau.
            </p>
            <FormulaireEmailTest
              modeles={MODELES_TEST.map((m) => ({ valeur: m, libelle: LIBELLES_MODELE_TEST[m] }))}
            />
          </div>
        </section>
        <div className="flex flex-col gap-6">
          <section aria-labelledby="invitations" className={CARTE}>
            <h2 id="invitations" className="text-lg font-bold">
              Invitations
            </h2>
            <FormulaireValidite validite={vue.validiteInvitationJours} />
          </section>
          <section aria-labelledby="conservation" className={CARTE}>
            <h2 id="conservation" className="text-lg font-bold">
              Conservation des données
            </h2>
            <FormulaireConservation
              evenements={vue.conservationEvenementsJours}
              resultats={vue.conservationResultatsJours}
              contact={vue.contactDonnees ?? ""}
            />
            <p className="text-[13px] leading-snug text-muet">
              Suppression automatique à l’échéance. Ces informations apparaissent sur l’écran d’information
              présenté aux étudiants avant chaque examen.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
