import type { NextConfig } from "next";

/**
 * shiki (coloration du code, lot 3) et ses dépendances d'exécution, hors bundle : le traçage de Next
 * ne suit pas ses grammaires (imports dynamiques) ni ses dépendances. Liste relevée pour shiki 4.4
 * (dépendances de shiki et @shikijs/langs, sans les @types) ; à relever de nouveau à chaque montée de
 * version : le serveur de bout en bout, isolé du dépôt, refuse de démarrer s'il en manque une.
 */
const PAQUETS_SHIKI = [
  "shiki",
  "@shikijs/core",
  "@shikijs/engine-javascript",
  "@shikijs/engine-oniguruma",
  "@shikijs/langs",
  "@shikijs/primitive",
  "@shikijs/themes",
  "@shikijs/types",
  "@shikijs/vscode-textmate",
  "@ungap/structured-clone",
  "ccount",
  "character-entities-html4",
  "character-entities-legacy",
  "comma-separated-tokens",
  "dequal",
  "devlop",
  "hast-util-to-html",
  "hast-util-whitespace",
  "html-void-elements",
  "mdast-util-to-hast",
  "micromark-util-character",
  "micromark-util-encode",
  "micromark-util-sanitize-uri",
  "micromark-util-symbol",
  "micromark-util-types",
  "oniguruma-parser",
  "oniguruma-to-es",
  "property-information",
  "regex",
  "regex-recursion",
  "regex-utilities",
  "space-separated-tokens",
  "stringify-entities",
  "trim-lines",
  "unist-util-is",
  "unist-util-position",
  "unist-util-stringify-position",
  "unist-util-visit",
  "unist-util-visit-parents",
  "vfile",
  "vfile-message",
  "zwitch",
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Les images ne passent jamais par l'optimiseur de Next (/_next/image) : il ne transmettrait pas le
  // cookie de session et ouvrirait une surface inutile. Elles sont déjà ré-encodées par sharp (lot 3).
  images: { unoptimized: true },
  // Paquets serveur non bundlés : copiés tels quels dans .next/standalone/node_modules.
  // Leur présence réelle est vérifiée au démarrage (src/instrumentation.ts).
  // read-excel-file exécute son analyse XML par des fonctions sérialisées (worker-f) :
  // bundlées et renommées par Turbopack, elles casseraient à l'exécution.
  // write-excel-file (exports des résultats, lot 7) suit le même chemin que read-excel-file.
  serverExternalPackages: ["pg", "@node-rs/argon2", "read-excel-file", "write-excel-file"],
  outputFileTracingIncludes: {
    // scripts/migrer.mjs tourne dans le conteneur avant server.js : il a besoin
    // du migrator Drizzle, que le traçage de Next ne copie pas de lui-même.
    // @node-rs/argon2 n'est importé que dynamiquement (instrumentation, cf.
    // solutions/nextjs-standalone-file-type-strtok3-absent) tant que le module
    // auth ne l'utilise pas statiquement (lot 1, tâche 4) : le traçage ne le
    // copie pas non plus. Le glob couvre le paquet de plateforme quel qu'il
    // soit (msvc en local, musl dans l'image Docker, gnu en CI).
    // Même chose pour read-excel-file (import de listes, lot 2) et ses dépendances, chargés hors bundle,
    // et pour sharp (images, lot 3) : son binaire natif (@img/sharp-<plateforme>) est chargé par un
    // chemin calculé que le traçage ne voit pas. shiki et ses dépendances : voir PAQUETS_SHIKI.
    "/*": [
      "node_modules/drizzle-orm/**",
      "node_modules/@node-rs/argon2/**",
      "node_modules/@node-rs/argon2-*/**",
      "node_modules/read-excel-file/**",
      "node_modules/write-excel-file/**",
      "node_modules/worker-f/**",
      "node_modules/unzipper-esm/**",
      "node_modules/saxen/**",
      "node_modules/fflate/**",
      "node_modules/graceful-fs/**",
      "node_modules/node-int64/**",
      "node_modules/sharp/**",
      "node_modules/@img/**",
      "node_modules/detect-libc/**",
      "node_modules/semver/**",
      ...PAQUETS_SHIKI.map((paquet) => `node_modules/${paquet}/**`),
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          ...(process.env.NODE_ENV === "production"
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
      {
        // Service worker (décision D4 du plan du lot 9) : jamais mis en cache, CSP propre au script.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
