import type { Metadata } from "next";
import { executerPage } from "@/lib/page";
import { decouperEnBlocs, LIMITES_QCM } from "@/lib/regles-qcm";
import { exigerActeur } from "@/modules/auth";
import { lireQcm } from "@/modules/qcm";
import { EditeurQuestion } from "./EditeurQuestion";
import { FournisseurEnregistrement, LienSansPerte } from "./enregistrement";
import { EnTeteQcm } from "./EnTeteQcm";
import { FormulaireParametres } from "./FormulaireParametres";
import { ListeQuestions } from "./ListeQuestions";

export const metadata: Metadata = { title: "Éditeur de QCM" };

const ONGLET = "-mb-px flex min-h-11 items-center border-b-[3px] px-4 text-[15px]";

export default async function PageEditeurQcm(props: PageProps<"/enseignant/qcm/[qcmId]">) {
  const { qcmId } = await props.params;
  const recherche = await props.searchParams;
  // lireQcm d'abord : le QCM d'un autre compte (ou un identifiant mal formé) donne la page 404.
  const qcm = await executerPage(async () => lireQcm(await exigerActeur(), { qcmId }));
  const parametres = recherche.onglet === "parametres";
  const demandee = typeof recherche.question === "string" ? recherche.question : null;
  const index = Math.max(
    0,
    qcm.questions.findIndex((q) => q.id === demandee),
  );
  const courante = qcm.questions[index];
  const precedente = index > 0 ? qcm.questions[index - 1] : undefined;
  const suivante = qcm.questions[index + 1];
  const blocs = decouperEnBlocs(qcm.questions);
  const indexBloc = blocs.findIndex((bloc) => bloc.some((q) => q.id === courante?.id));
  const modifiable = qcm.statut === "brouillon";
  const base = `/enseignant/qcm/${qcm.id}`;

  return (
    <FournisseurEnregistrement>
      <EnTeteQcm qcm={qcm} numeroCourant={courante ? index + 1 : 1} />
      <nav aria-label="Sections du QCM" className="flex gap-1 border-b border-ligne">
        <LienSansPerte
          href={courante ? `${base}?question=${courante.id}` : base}
          aria-current={parametres ? undefined : "page"}
          className={`${ONGLET} ${parametres ? "border-transparent text-encre-2" : "border-bleu font-bold text-bleu-fonce"}`}
        >
          Questions · {qcm.questions.length}
        </LienSansPerte>
        <LienSansPerte
          href={`${base}?onglet=parametres`}
          aria-current={parametres ? "page" : undefined}
          className={`${ONGLET} ${parametres ? "border-bleu font-bold text-bleu-fonce" : "border-transparent text-encre-2"}`}
        >
          Paramètres
        </LienSansPerte>
      </nav>
      {parametres ? (
        <FormulaireParametres
          qcm={{
            id: qcm.id,
            titre: qcm.titre,
            modeChrono: qcm.modeChrono,
            dureeGlobaleS: qcm.dureeGlobaleS,
            dureeQuestionS: qcm.dureeQuestionS,
            noteVisibleDefaut: qcm.noteVisibleDefaut,
            correctionVisibleDefaut: qcm.correctionVisibleDefaut,
          }}
          lectureSeule={!modifiable}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
          <ListeQuestions
            qcmId={qcm.id}
            questions={qcm.questions}
            selection={courante?.id ?? null}
            modifiable={modifiable}
            plein={qcm.questions.length >= LIMITES_QCM.questionsMax}
          />
          {courante ? (
            <EditeurQuestion
              key={courante.id}
              qcmId={qcm.id}
              question={courante}
              numero={index + 1}
              precedente={
                precedente
                  ? { id: precedente.id, numero: index, lieeASuivante: precedente.lieeASuivante }
                  : null
              }
              suivante={suivante ? { id: suivante.id, numero: index + 2 } : null}
              peutMonter={indexBloc > 0}
              peutDescendre={indexBloc >= 0 && indexBloc < blocs.length - 1}
              chronoParQuestion={qcm.modeChrono === "par_question"}
              dureeParDefautS={qcm.dureeQuestionS}
              lectureSeule={!modifiable}
            />
          ) : (
            <p className="rounded-2xl border border-ligne bg-carte p-5 text-[15px] text-muet">
              Ce QCM n’a pas encore de question : ajoute la première.
            </p>
          )}
        </div>
      )}
    </FournisseurEnregistrement>
  );
}
