/**
 * Service worker de Carreau (décision D4 du plan du lot 9) : réseau d'abord, rien en cache.
 * Il ne répond qu'aux navigations GET ; hors ligne, il construit lui-même une page de repli. Aucune page,
 * réponse d'API ni image n'est gardée sur le téléphone, qui peut être partagé ; l'examen ne se passe
 * pas hors ligne (spec §15).
 */
const PAGE_HORS_LIGNE = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pas de connexion · Carreau</title>
<style>
body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f4f1ea; color: #15171c; font-family: system-ui, sans-serif; }
main { max-width: 28rem; padding: 1.5rem; }
h1 { font-size: 1.75rem; margin: 0 0 0.75rem; }
p { font-size: 1.0625rem; line-height: 1.5; color: #3d434d; margin: 0 0 1.25rem; }
a { display: inline-block; padding: 0.75rem 1.25rem; border-radius: 10px; background: #2344c4; color: #ffffff; font-weight: 700; text-decoration: none; }
</style>
</head>
<body>
<main>
<h1>Pas de connexion</h1>
<p>Carreau a besoin d’internet. Vérifie le Wi-Fi ou les données mobiles de ton téléphone, puis réessaie.</p>
<a href="">Réessayer</a>
</main>
</body>
</html>`;

const ENTETES_HORS_LIGNE = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (evenement) => {
  evenement.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (evenement) => {
  const requete = evenement.request;
  // Seules les navigations passent par ici : API, scripts, images et polices vont au réseau sans détour.
  if (requete.mode !== "navigate" || requete.method !== "GET") return;
  evenement.respondWith(
    fetch(requete).catch(() => new Response(PAGE_HORS_LIGNE, { status: 503, headers: ENTETES_HORS_LIGNE })),
  );
});
