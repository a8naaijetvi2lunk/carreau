"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker (décision D4 du plan du lot 9) : installation de l'application et page
 * de repli hors ligne. `updateViaCache: "none"` : chaque mise en ligne est prise au chargement suivant.
 */
export function EnregistrementServiceWorker(): null {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Sans service worker, Carreau fonctionne comme un site : seule l'installation en dépend.
    });
  }, []);
  return null;
}
