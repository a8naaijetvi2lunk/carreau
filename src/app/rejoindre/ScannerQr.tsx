"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Alerte, Bouton } from "@/components/ui";
import {
  codeDepuisQr,
  MESSAGE_CAMERA_REFUSEE,
  MESSAGE_QR_ETRANGER,
  MESSAGE_SANS_CAMERA,
} from "@/lib/qr-rejoindre";

/**
 * Scanner du QR code projeté (spec §1.2, point 13 ; décision D5 du plan du lot 9), surtout utile dans
 * l'application installée, qui n'a pas de barre d'adresse. Le contenu lu n'est jamais suivi : seul un
 * code de session en est tiré. La caméra s'arrête à la première lecture valide et à la fermeture.
 */
export function ScannerQr({ onCode, onFermer }: { onCode: (code: string) => void; onFermer: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  const lire = useEffectEvent((texte: string, scanner: { stop(): void }) => {
    const code = codeDepuisQr(texte, window.location.origin);
    if (code === null) {
      setMessage(MESSAGE_QR_ETRANGER);
      return;
    }
    scanner.stop();
    onCode(code);
  });

  const signaler = useEffectEvent((texte: string) => setMessage(texte));

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let actif = true;
    let scanner: { destroy(): void } | null = null;
    void (async () => {
      const { default: QrScanner } = await import("qr-scanner");
      if (!actif) return;
      if (!(await QrScanner.hasCamera())) {
        if (actif) signaler(MESSAGE_SANS_CAMERA);
        return;
      }
      if (!actif) return;
      const instance = new QrScanner(element, (resultat) => lire(resultat.data, instance), {
        returnDetailedScanResult: true,
        preferredCamera: "environment",
        maxScansPerSecond: 5,
      });
      scanner = instance;
      try {
        await instance.start();
      } catch {
        if (actif) signaler(MESSAGE_CAMERA_REFUSEE);
      }
    })();
    return () => {
      actif = false;
      scanner?.destroy();
    };
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-base text-encre-2">Vise le QR code projeté au tableau.</p>
      <div className="overflow-hidden rounded-2xl border border-ligne bg-encre">
        <video
          ref={video}
          muted
          playsInline
          aria-label="Image de la caméra"
          className="aspect-square w-full object-cover"
        />
      </div>
      {message ? <Alerte ton="info">{message}</Alerte> : null}
      <Bouton variante="secondaire" onClick={onFermer} className="min-h-14 text-[17px]">
        Saisir le code à la place
      </Bouton>
    </div>
  );
}
