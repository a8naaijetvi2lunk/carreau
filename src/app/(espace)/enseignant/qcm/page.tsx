import type { Metadata } from "next";
import { executerPage } from "@/lib/page";
import { exigerActeur } from "@/modules/auth";
import { listerQcm } from "@/modules/qcm";
import { FormulaireNouveauQcm } from "./FormulaireNouveauQcm";
import { ListeQcm } from "./ListeQcm";

export const metadata: Metadata = { title: "QCM" };

export default async function PageQcm(props: PageProps<"/enseignant/qcm">) {
  const { archives } = await props.searchParams;
  const qcm = await executerPage(async () => listerQcm(await exigerActeur()));
  return (
    <>
      <h1 className="font-titre text-4xl leading-[1.05] font-extrabold tracking-tight">QCM</h1>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <ListeQcm qcm={qcm} archives={archives === "1"} />
        <section
          aria-labelledby="nouveau-qcm"
          className="flex flex-col gap-3 rounded-2xl border border-ligne bg-carte p-5"
        >
          <h2 id="nouveau-qcm" className="text-lg font-bold">
            Nouveau QCM
          </h2>
          <FormulaireNouveauQcm />
          <p className="text-[13px] text-muet">
            Le QCM est créé en brouillon avec une première question ; tout est enregistré au fil de ta saisie.
          </p>
        </section>
      </div>
    </>
  );
}
