import type { Metadata } from "next";
import { Etiquette } from "@/components/ui";
import { formaterDateCourte } from "@/lib/dates";
import { env } from "@/lib/env";
import { executerPage } from "@/lib/page";
import { LIBELLES_PORTEE_MCP } from "@/lib/regles-mcp";
import { exigerActeur } from "@/modules/auth";
import { listerJetonsMcp, type JetonMcpResume } from "@/modules/mcp";
import { BoutonRevoquer } from "./BoutonRevoquer";
import { ChampCopie } from "./ChampCopie";
import { FormulaireJeton } from "./FormulaireJeton";

export const metadata: Metadata = { title: "Connexion MCP" };

const CARTE = "flex min-w-0 flex-col gap-3 rounded-2xl border border-ligne bg-carte p-5";
const TITRE_SECTION = "text-lg font-bold";
const CODE = "overflow-x-auto rounded-xl bg-papier p-4 font-code text-[13px] leading-relaxed text-encre";

const PEUT = [
  "Créer un QCM en brouillon",
  "Ajouter, modifier, supprimer, lier ou délier les questions d’un brouillon (code compris)",
  "Lister tes brouillons et le nom de tes classes",
];

const NE_PEUT_PAS = [
  "Lancer une session ou passer un QCM en « prêt »",
  "Voir les étudiants, leurs résultats ou leurs événements",
  "Lire un QCM prêt ou archivé, ajouter des images",
];

function usage(jeton: JetonMcpResume): string {
  const cree = `Créé le ${formaterDateCourte(jeton.creeLe)}`;
  return jeton.dernierUsageLe
    ? `${cree} · dernier usage le ${formaterDateCourte(jeton.dernierUsageLe)}`
    : `${cree} · jamais utilisé`;
}

/** Connexion d'un assistant IA par MCP (spec §10, maquette « Prof-MCP ») : adresse, jetons, mode d'emploi. */
export default async function PageConnexionMcp() {
  const jetons = await executerPage(async () => listerJetonsMcp(await exigerActeur()));
  const adresse = new URL("/api/mcp", env().APP_URL).toString();
  const configuration = JSON.stringify(
    { mcpServers: { carreau: { url: adresse, headers: { Authorization: "Bearer carreau_…" } } } },
    null,
    2,
  );
  const commande = `claude mcp add --transport http carreau ${adresse} --header "Authorization: Bearer carreau_…"`;

  return (
    <>
      <div className="flex max-w-3xl flex-col gap-2">
        <h1 className="font-titre text-4xl leading-[1.05] font-extrabold tracking-tight">Connexion MCP</h1>
        <p className="text-[15px] text-encre-2">
          Connecte ton assistant IA compatible MCP pour qu’il prépare des QCM à ta place. Tout ce qu’il crée
          arrive en brouillon : tu relis avant de lancer une session.
        </p>
      </div>
      <div className="grid max-w-3xl gap-6">
        <section aria-labelledby="adresse-serveur" className={CARTE}>
          <h2 id="adresse-serveur" className={TITRE_SECTION}>
            Adresse du serveur
          </h2>
          <ChampCopie
            id="adresse-mcp"
            libelle="Adresse du serveur"
            valeur={adresse}
            libelleBouton="Copier l’adresse du serveur"
          />
        </section>

        <section aria-labelledby="tes-jetons" className={CARTE}>
          <h2 id="tes-jetons" className={TITRE_SECTION}>
            Tes jetons
          </h2>
          {jetons.length === 0 ? (
            <p className="text-[15px] text-muet">Aucun jeton actif : génère le premier ci-dessous.</p>
          ) : (
            <ul aria-label="Tes jetons" className="flex flex-col">
              {jetons.map((jeton, index) => (
                <li
                  key={jeton.id}
                  data-jeton={jeton.nom}
                  className={`flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between ${
                    index === 0 ? "" : "border-t border-ligne-douce"
                  }`}
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <strong className="truncate text-base">{jeton.nom}</strong>
                      <Etiquette ton={jeton.portee === "ecriture" ? "bleu" : "neutre"}>
                        {LIBELLES_PORTEE_MCP[jeton.portee]}
                      </Etiquette>
                    </span>
                    <span className="text-sm text-muet">
                      <span className="font-code">{jeton.prefixe}…</span> · {usage(jeton)}
                    </span>
                  </span>
                  <BoutonRevoquer jetonId={jeton.id} nom={jeton.nom} />
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-ligne-douce pt-4">
            <FormulaireJeton />
          </div>
        </section>

        <section aria-labelledby="capacites" className={CARTE}>
          <h2 id="capacites" className={TITRE_SECTION}>
            Ce que ton assistant peut faire
          </h2>
          <ul aria-label="Ce qu’il peut faire" className="flex flex-col gap-1.5 text-[15px]">
            {PEUT.map((texte) => (
              <li key={texte} className="flex gap-2">
                <span aria-hidden="true" className="font-bold text-bleu">
                  ✓
                </span>
                {texte}
              </li>
            ))}
          </ul>
          <ul aria-label="Ce qu’il ne peut pas faire" className="flex flex-col gap-1.5 text-[15px]">
            {NE_PEUT_PAS.map((texte) => (
              <li key={texte} className="flex gap-2 text-encre-2">
                <span aria-hidden="true" className="font-bold text-orange-fonce">
                  ✗
                </span>
                {texte}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="configuration" className={CARTE}>
          <h2 id="configuration" className={TITRE_SECTION}>
            Configuration de ton assistant
          </h2>
          <p className="text-[15px] text-encre-2">
            Ajoute ce serveur à la configuration de ton assistant, avec ton jeton à la place de « carreau_… »
            :
          </p>
          <pre className={CODE}>{configuration}</pre>
          <p className="text-[15px] text-encre-2">Avec Claude Code, en une commande :</p>
          <pre className={CODE}>{commande}</pre>
        </section>

        <section aria-labelledby="exemple-demande" className={CARTE}>
          <h2 id="exemple-demande" className={TITRE_SECTION}>
            Exemple de demande
          </h2>
          <blockquote className="border-l-4 border-bleu pl-4 text-[15px] text-encre-2">
            « Crée un QCM de 15 questions sur les tris (bulles, insertion, fusion) pour des étudiants de 1re
            année, dont 3 questions avec du code Python. Lie les questions 4 et 5. »
          </blockquote>
        </section>
      </div>
    </>
  );
}
