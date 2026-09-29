import type { CodeAffiche } from "@/lib/vue-session";

/**
 * Code de la session (salle d'attente) ou code de reprise pendant l'examen (amendement A1 du plan du
 * lot 4) : jamais projeté après le démarrage, montré à l'étudiant qui reprend sur un autre téléphone.
 */
export function PanneauCode({ code, reprise }: { code: CodeAffiche; reprise: boolean }) {
  const taille = reprise ? 160 : 200;
  return (
    <section
      aria-labelledby="panneau-code"
      className="flex flex-col items-center gap-3 rounded-2xl border border-ligne bg-carte p-5 text-center"
    >
      <h2 id="panneau-code" className="self-start text-lg font-bold">
        {reprise ? "Reprise sur un autre téléphone" : "Code de la session"}
      </h2>
      {/* eslint-disable-next-line @next/next/no-img-element -- QR code en URI data:, rien à optimiser */}
      <img
        src={code.qrCode}
        alt={`QR code de la session, vers ${code.lien}`}
        width={taille}
        height={taille}
        className="rounded-lg border border-ligne bg-blanc"
      />
      <output aria-label="Code de la session" className="font-code text-4xl font-semibold tracking-[0.08em]">
        {code.code}
      </output>
      <p className="text-sm text-muet">
        Nouveau code dans {code.secondesRestantes} s · {code.adresse}
      </p>
      <p className="text-sm text-encre-2">
        {reprise
          ? "Montre ce code à l’étudiant qui doit reprendre sur un autre téléphone, puis autorise sa demande."
          : "Ouvre l’écran projeté pour que les étudiants scannent le QR code."}
      </p>
    </section>
  );
}
