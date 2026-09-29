import type { Metadata } from "next";
import { LienBouton } from "@/components/ui";
import { executerPage } from "@/lib/page";
import { exigerActeur } from "@/modules/auth";
import { lireClasse, listerClasses } from "@/modules/classes";
import { ListeClasses } from "../ListeClasses";
import { EnTeteClasse } from "./EnTeteClasse";
import { FormulaireAjoutEtudiant } from "./FormulaireAjoutEtudiant";
import { ListeEtudiants } from "./ListeEtudiants";

export const metadata: Metadata = { title: "Classe" };

export default async function PageClasse(props: PageProps<"/enseignant/classes/[classeId]">) {
  const { classeId } = await props.params;
  const { classe, classes } = await executerPage(async () => {
    const acteur = await exigerActeur();
    // lireClasse d'abord : la classe d'un autre compte (ou un identifiant mal formé) donne la page 404.
    const lue = await lireClasse(acteur, { classeId });
    return { classe: lue, classes: await listerClasses(acteur) };
  });
  const tiersTemps = classe.etudiants.filter((e) => e.tiersTemps).length;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-titre text-4xl leading-[1.05] font-extrabold tracking-tight">Classes</h1>
        <LienBouton href="/enseignant/classes" variante="secondaire">
          + Nouvelle classe
        </LienBouton>
      </div>
      <div className="grid gap-6 md:grid-cols-[16rem_minmax(0,1fr)] md:items-start">
        <ListeClasses classes={classes} archivees={classe.archivee} selection={classe.id} />
        <section
          aria-labelledby="titre-classe"
          className="flex min-w-0 flex-col gap-6 rounded-2xl border border-ligne bg-carte p-5"
        >
          <EnTeteClasse
            classe={{ id: classe.id, nom: classe.nom, archivee: classe.archivee }}
            effectif={classe.etudiants.length}
            tiersTemps={tiersTemps}
          />
          <FormulaireAjoutEtudiant classeId={classe.id} />
          <ListeEtudiants etudiants={classe.etudiants} />
        </section>
      </div>
    </>
  );
}
