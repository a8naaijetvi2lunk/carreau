import type { Metadata } from "next";
import { executerPage } from "@/lib/page";
import { exigerActeur } from "@/modules/auth";
import { lireSession } from "@/modules/sessions";
import { EnTeteSession } from "./EnTeteSession";
import { PilotageSession } from "./PilotageSession";

export const metadata: Metadata = { title: "Session" };

/** Page de pilotage d'une session (décision D18) ; la session d'un autre compte répond 404. */
export default async function PageSession(props: PageProps<"/enseignant/sessions/[sessionId]">) {
  const { sessionId } = await props.params;
  const session = await executerPage(async () => lireSession(await exigerActeur(), { sessionId }));
  return (
    <>
      <EnTeteSession session={session} />
      <PilotageSession
        sessionId={session.id}
        suiviInitial={session.suivi}
        resultatsId={session.sessionOrigineId ?? session.id}
      />
    </>
  );
}
