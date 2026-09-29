import type { Metadata } from "next";
import { executerPage } from "@/lib/page";
import { exigerActeur } from "@/modules/auth";
import { listerClasses } from "@/modules/classes";
import { FormulaireNouvelleClasse } from "./FormulaireNouvelleClasse";
import { ListeClasses } from "./ListeClasses";

export const metadata: Metadata = { title: "Classes" };

export default async function PageClasses(props: PageProps<"/enseignant/classes">) {
  const { archivees } = await props.searchParams;
  const classes = await executerPage(async () => listerClasses(await exigerActeur()));
  return (
    <>
      <h1 className="font-titre text-4xl leading-[1.05] font-extrabold tracking-tight">Classes</h1>
      <div className="grid gap-6 md:grid-cols-[16rem_minmax(0,1fr)] md:items-start">
        <ListeClasses classes={classes} archivees={archivees === "1"} />
        <section
          aria-labelledby="nouvelle-classe"
          className="flex flex-col gap-3 rounded-2xl border border-ligne bg-carte p-5"
        >
          <h2 id="nouvelle-classe" className="text-lg font-bold">
            Nouvelle classe
          </h2>
          <FormulaireNouvelleClasse />
          <p className="text-[13px] text-muet">
            Donne-lui un nom court, comme « TD2 » ou « Groupe A » : tu importeras ensuite la liste de ses
            étudiants.
          </p>
        </section>
      </div>
    </>
  );
}
