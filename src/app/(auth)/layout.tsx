import Link from "next/link";
import { Marque } from "@/components/ui";

/** Pages publiques des comptes (connexion, activation, mot de passe) : colonne étroite centrée. */
export default function LayoutAuth({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-5 py-12">
      <Link href="/" className="self-start">
        <Marque />
      </Link>
      <main className="flex flex-col gap-6">{children}</main>
    </div>
  );
}
