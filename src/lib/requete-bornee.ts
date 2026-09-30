/**
 * Corps d'une requête lu une seule fois et borné (serveur MCP, spec §10 ; décision D5 du plan du lot 8).
 * `mcp-handler` clone puis relit le corps : sans borne, un jeton valide pourrait saturer la mémoire du
 * serveur. On lit donc le corps en s'arrêtant à la borne, puis on reconstruit une requête identique.
 * - `Content-Length` annoncé au-delà de la borne : null, sans rien lire ;
 * - corps réel au-delà de la borne (flux, longueur absente ou mensongère) : null, lecture interrompue ;
 * - sinon : nouvelle `Request`, corps en mémoire (au plus `octetsMax` octets).
 */
export async function lireRequeteBornee(requete: Request, octetsMax: number): Promise<Request | null> {
  if (!requete.body) return requete;
  const annonce = requete.headers.get("content-length")?.trim() ?? "";
  if (/^\d+$/.test(annonce) && Number(annonce) > octetsMax) {
    await requete.body.cancel();
    return null;
  }
  const lecteur = requete.body.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.byteLength;
    if (total > octetsMax) {
      await lecteur.cancel();
      return null;
    }
    morceaux.push(value);
  }
  const corps = new Uint8Array(total);
  let position = 0;
  for (const morceau of morceaux) {
    corps.set(morceau, position);
    position += morceau.byteLength;
  }
  const entetes = new Headers(requete.headers);
  // Le corps reconstruit a une longueur connue : l'ancien encodage de transfert n'a plus cours.
  entetes.delete("transfer-encoding");
  entetes.set("content-length", String(total));
  return new Request(requete.url, {
    method: requete.method,
    headers: entetes,
    body: corps,
    signal: requete.signal,
  });
}
