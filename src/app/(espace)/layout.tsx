import Link from "next/link";
import { Alerte, Bouton, Marque } from "@/components/ui";
import { estAdministrateur, LIBELLES_ROLE } from "@/lib/acteur";
import { executerPage } from "@/lib/page";
import { exigerActeur } from "@/modules/auth";
import { parametresRgpdComplets } from "@/modules/parametres";
import { seDeconnecterAction } from "./actions";
import { NavigationPrincipale, type LienNavigation } from "./NavigationPrincipale";

/**
 * Coquille de l'espace connecté (maquettes « Enseignant » et « Admin »). Chaque page appelle
 * aussi sa propre garde : un layout n'est pas réexécuté à chaque navigation.
 */
export default async function LayoutEspace({ children }: Readonly<{ children: React.ReactNode }>) {
  const { acteur, rgpdIncomplet } = await executerPage(async () => {
    const acteur = await exigerActeur();
    return { acteur, rgpdIncomplet: acteur.role === "super_admin" && !(await parametresRgpdComplets()) };
  });
  const liens: LienNavigation[] = [
    { href: "/enseignant", libelle: "Accueil", icone: "accueil", exact: true },
    { href: "/enseignant/qcm", libelle: "QCM", icone: "qcm" },
    { href: "/enseignant/classes", libelle: "Classes", icone: "classes" },
    { href: "/enseignant/sessions", libelle: "Sessions", icone: "sessions" },
  ];
  const liensAdministration: LienNavigation[] = [];
  if (estAdministrateur(acteur.role)) {
    liensAdministration.push({ href: "/admin/enseignants", libelle: "Enseignants", icone: "enseignants" });
  }
  if (acteur.role === "super_admin") {
    liensAdministration.push({ href: "/admin/parametres", libelle: "Paramètres", icone: "parametres" });
  }
  const initiales = `${acteur.prenom.charAt(0)}${acteur.nom.charAt(0)}`.toUpperCase();

  return (
    <div className="min-h-dvh md:flex">
      <nav
        aria-label="Navigation principale"
        className="flex flex-col gap-1 border-b border-ligne bg-carte px-4 py-4 md:sticky md:top-0 md:h-dvh md:w-62 md:shrink-0 md:border-r md:border-b-0 md:py-6"
      >
        <Link href="/enseignant" className="self-start px-3 pb-3">
          <Marque />
        </Link>
        <NavigationPrincipale liens={liens} />
        {liensAdministration.length > 0 ? (
          <>
            <p className="px-3 pt-4 pb-1 text-xs font-bold tracking-[0.08em] text-muet uppercase">
              Administration
            </p>
            <NavigationPrincipale liens={liensAdministration} />
          </>
        ) : null}
        <div className="mt-4 flex items-center gap-3 border-t border-ligne-douce px-3 pt-4 md:mt-auto">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bleu text-sm font-bold text-blanc"
          >
            {initiales}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-bold">
              {acteur.prenom} {acteur.nom}
            </span>
            <span className="text-xs text-muet">{LIBELLES_ROLE[acteur.role]}</span>
          </span>
        </div>
        <form action={seDeconnecterAction} className="px-3 pt-2">
          <Bouton type="submit" variante="secondaire" className="w-full">
            Se déconnecter
          </Bouton>
        </form>
      </nav>
      <main className="flex min-w-0 flex-1 flex-col gap-6 px-5 py-8 md:px-10">
        {rgpdIncomplet ? (
          <Alerte ton="erreur">
            Renseigne les durées de conservation et le contact des données dans{" "}
            <Link href="/admin/parametres" className="font-bold underline">
              Paramètres
            </Link>{" "}
            : sans eux, aucune session d’examen ne pourra être lancée.
          </Alerte>
        ) : null}
        {children}
      </main>
    </div>
  );
}
