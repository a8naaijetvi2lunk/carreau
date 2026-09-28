import { Marque } from "@/components/ui";

export default function Accueil() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-10 px-5 py-12">
      <Marque />
      <div className="flex flex-col gap-4">
        <h1 className="font-titre text-4xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-5xl">
          Des QCM sur téléphone, en classe, pour des examens équitables.
        </h1>
        <p className="text-lg text-encre-2">
          Chaque étudiant répond sur son téléphone, question par question. L’enseignant suit la session en
          direct.
        </p>
      </div>
      <section
        aria-labelledby="rejoindre"
        className="flex flex-col gap-2 rounded-2xl border border-ligne bg-carte p-5"
      >
        <h2 id="rejoindre" className="text-base font-bold">
          Rejoindre un examen
        </h2>
        <p className="text-encre-2">
          Scanne le QR code affiché par ton enseignant avec l’appareil photo de ton téléphone.
        </p>
      </section>
    </main>
  );
}
