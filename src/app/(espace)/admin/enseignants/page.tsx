import type { Metadata } from "next";
import Link from "next/link";
import { Etiquette } from "@/components/ui";
import { LIBELLES_ROLE, type Role } from "@/lib/acteur";
import { formaterDateCourte } from "@/lib/dates";
import { executerPage } from "@/lib/page";
import { exigerActeur } from "@/modules/auth";
import { listerComptes } from "@/modules/comptes";
import { ActionCompte } from "./ActionCompte";
import {
  annulerInvitationAction,
  desactiverCompteAction,
  reactiverCompteAction,
  reinitialiserDoubleAuthAction,
  relancerInvitationAction,
} from "./actions";
import { FormulaireInvitation } from "./FormulaireInvitation";
import { FormulaireRole } from "./FormulaireRole";

export const metadata: Metadata = { title: "Enseignants" };

const FILTRES = [
  { valeur: "tous", libelle: "Tous" },
  { valeur: "actifs", libelle: "Actifs" },
  { valeur: "invitations", libelle: "Invitations" },
  { valeur: "desactives", libelle: "Désactivés" },
] as const;

type Filtre = (typeof FILTRES)[number]["valeur"];

const TONS_ROLE: Record<Role, "sombre" | "bleu" | "neutre"> = {
  super_admin: "sombre",
  admin: "bleu",
  enseignant: "neutre",
};

const POINTS = { actif: "bg-bleu", attente: "bg-ambre", alerte: "bg-orange", inactif: "bg-muet" } as const;

const LIGNE =
  "flex flex-col gap-2 border-t border-ligne-douce px-5 py-3 md:grid md:grid-cols-[minmax(0,1fr)_7.5rem_16rem_minmax(0,auto)] md:items-center md:gap-4";

function Point({ ton }: { ton: keyof typeof POINTS }) {
  return <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${POINTS[ton]}`} />;
}

export default async function PageEnseignants(props: PageProps<"/admin/enseignants">) {
  const { filtre: brut } = await props.searchParams;
  const filtre: Filtre = FILTRES.find((f) => f.valeur === brut)?.valeur ?? "tous";
  const { acteur, liste } = await executerPage(async () => {
    const acteur = await exigerActeur();
    return { acteur, liste: await listerComptes(acteur) };
  });
  const comptes = liste.comptes.filter(
    (c) => filtre === "tous" || (filtre === "actifs" && c.actif) || (filtre === "desactives" && !c.actif),
  );
  const invitations = filtre === "tous" || filtre === "invitations" ? liste.invitations : [];

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-titre text-4xl leading-[1.05] font-extrabold tracking-tight">Enseignants</h1>
        <p className="text-encre-2">
          Invite des collègues par email. Chaque lien est personnel et à usage unique.
        </p>
      </div>

      <section
        aria-labelledby="inviter"
        className="flex flex-col gap-3 rounded-2xl border border-ligne bg-carte p-5"
      >
        <h2 id="inviter" className="text-lg font-bold">
          Inviter un collègue
        </h2>
        <FormulaireInvitation
          roles={acteur.role === "super_admin" ? ["enseignant", "admin"] : ["enseignant"]}
        />
        <p className="text-[13px] text-muet">
          Admin : invite, relance et désactive des enseignants. Seul le super-admin change les rôles et les
          paramètres.
        </p>
      </section>

      <section aria-labelledby="comptes" className="flex flex-col rounded-2xl border border-ligne bg-carte">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <h2 id="comptes" className="text-lg font-bold">
            Comptes <span className="text-sm font-normal text-muet">· {liste.comptes.length}</span>
          </h2>
          <nav aria-label="Filtrer les comptes" className="flex flex-wrap gap-1.5">
            {FILTRES.map((f) => (
              <Link
                key={f.valeur}
                href={f.valeur === "tous" ? "/admin/enseignants" : `/admin/enseignants?filtre=${f.valeur}`}
                aria-current={filtre === f.valeur ? "page" : undefined}
                className={`inline-flex min-h-9 items-center rounded-lg px-3 text-sm ${
                  filtre === f.valeur ? "bg-encre font-bold text-carte" : "border border-ligne bg-carte"
                }`}
              >
                {f.libelle}
              </Link>
            ))}
          </nav>
        </div>
        <ul className="flex flex-col">
          {invitations.map((i) => (
            // Clé sur l'adresse : une relance remplace l'invitation, la ligne (et son message) reste.
            <li key={`invitation-${i.email}`} className={LIGNE}>
              <span className="min-w-0 truncate text-[15px] font-bold">{i.email}</span>
              <span>
                <Etiquette ton={TONS_ROLE[i.role]}>{LIBELLES_ROLE[i.role]}</Etiquette>
              </span>
              <span className="flex items-center gap-2 text-sm">
                <Point ton={i.expiree ? "alerte" : "attente"} />
                {i.expiree
                  ? "Invitation expirée"
                  : `Invitation envoyée · expire le ${formaterDateCourte(i.expireLe)}`}
              </span>
              <span className="flex flex-wrap gap-1.5 md:justify-end">
                {i.actions.includes("relancer") ? (
                  <ActionCompte
                    action={relancerInvitationAction}
                    champs={{ invitationId: i.id }}
                    libelle="Relancer"
                  />
                ) : null}
                {i.actions.includes("annuler") ? (
                  <ActionCompte
                    action={annulerInvitationAction}
                    champs={{ invitationId: i.id }}
                    libelle="Annuler"
                  />
                ) : null}
              </span>
            </li>
          ))}
          {comptes.map((c) => (
            <li key={c.id} className={LIGNE}>
              <span className="flex min-w-0 flex-col">
                <strong className="truncate text-[15px]">
                  {c.prenom} {c.nom}
                  {c.estActeur ? " (toi)" : ""}
                </strong>
                <span className="truncate text-sm text-encre-2">{c.email}</span>
              </span>
              <span>
                <Etiquette ton={TONS_ROLE[c.role]}>{LIBELLES_ROLE[c.role]}</Etiquette>
              </span>
              <span className="flex flex-col gap-0.5 text-sm">
                <span className="flex items-center gap-2">
                  <Point ton={!c.actif ? "inactif" : c.doubleAuthConfiguree ? "actif" : "attente"} />
                  {!c.actif
                    ? "Désactivé"
                    : c.doubleAuthConfiguree
                      ? "Actif"
                      : "Double authentification à configurer"}
                </span>
                <span className="text-muet">
                  Dernière connexion :{" "}
                  {c.derniereConnexionLe ? formaterDateCourte(c.derniereConnexionLe) : "jamais"}
                </span>
              </span>
              <span className="flex flex-wrap gap-1.5 md:justify-end">
                {c.actions.includes("changer_role") ? (
                  <FormulaireRole utilisateurId={c.id} role={c.role} />
                ) : null}
                {c.actions.includes("reinitialiser_double_auth") ? (
                  <ActionCompte
                    action={reinitialiserDoubleAuthAction}
                    champs={{ utilisateurId: c.id }}
                    libelle="Réinitialiser la double authentification"
                  />
                ) : null}
                {c.actions.includes("desactiver") ? (
                  <ActionCompte
                    action={desactiverCompteAction}
                    champs={{ utilisateurId: c.id }}
                    libelle="Désactiver"
                    danger
                  />
                ) : null}
                {c.actions.includes("reactiver") ? (
                  <ActionCompte
                    action={reactiverCompteAction}
                    champs={{ utilisateurId: c.id }}
                    libelle="Réactiver"
                  />
                ) : null}
              </span>
            </li>
          ))}
          {invitations.length + comptes.length === 0 ? (
            <li className="border-t border-ligne-douce px-5 py-6 text-muet">
              Aucun compte dans cette catégorie.
            </li>
          ) : null}
        </ul>
      </section>
    </>
  );
}
