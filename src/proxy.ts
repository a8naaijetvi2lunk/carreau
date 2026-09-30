import { NextResponse, type NextRequest } from "next/server";
import { construireCsp, requeteEnHttps } from "@/lib/csp";

/**
 * Pose une CSP à nonce sur chaque page. Next 16.3 n'exécute plus `middleware.ts` :
 * seule la fonction `proxy` de `src/proxy.ts` est prise en compte.
 */
export function proxy(requete: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = construireCsp({
    nonce,
    developpement: process.env.NODE_ENV !== "production",
    https: requeteEnHttps(requete.headers, requete.nextUrl.protocol),
  });

  const entetesRequete = new Headers(requete.headers);
  entetesRequete.set("x-nonce", nonce);
  entetesRequete.set("Content-Security-Policy", csp);

  const reponse = NextResponse.next({ request: { headers: entetesRequete } });
  reponse.headers.set("Content-Security-Policy", csp);
  return reponse;
}

// sw.js : ses en-têtes (dont sa CSP) viennent de next.config.ts ; une seconde CSP s'y ajouterait.
export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sw.js).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
