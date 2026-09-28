import { reponseOk } from "@/lib/reponse-api";
import { verifierBase } from "@/modules/sante";

// Healthcheck (Docker, Coolify) : jamais mis en cache ni prérendu.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const ok = await verifierBase();
  return reponseOk({ ok }, ok ? 200 : 503);
}
