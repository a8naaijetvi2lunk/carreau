import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Paquets serveur non bundlés : copiés tels quels dans .next/standalone/node_modules.
  // Leur présence réelle est vérifiée au démarrage (src/instrumentation.ts).
  // read-excel-file exécute son analyse XML par des fonctions sérialisées (worker-f) :
  // bundlées et renommées par Turbopack, elles casseraient à l'exécution.
  serverExternalPackages: ["pg", "@node-rs/argon2", "read-excel-file"],
  outputFileTracingIncludes: {
    // scripts/migrer.mjs tourne dans le conteneur avant server.js : il a besoin
    // du migrator Drizzle, que le traçage de Next ne copie pas de lui-même.
    // @node-rs/argon2 n'est importé que dynamiquement (instrumentation, cf.
    // solutions/nextjs-standalone-file-type-strtok3-absent) tant que le module
    // auth ne l'utilise pas statiquement (lot 1, tâche 4) : le traçage ne le
    // copie pas non plus. Le glob couvre le paquet de plateforme quel qu'il
    // soit (msvc en local, musl dans l'image Docker, gnu en CI).
    // Même chose pour read-excel-file (import de listes, lot 2) et ses dépendances, chargés hors bundle.
    "/*": [
      "node_modules/drizzle-orm/**",
      "node_modules/@node-rs/argon2/**",
      "node_modules/@node-rs/argon2-*/**",
      "node_modules/read-excel-file/**",
      "node_modules/worker-f/**",
      "node_modules/unzipper-esm/**",
      "node_modules/saxen/**",
      "node_modules/fflate/**",
      "node_modules/graceful-fs/**",
      "node_modules/node-int64/**",
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
    ];
  },
};

export default nextConfig;
