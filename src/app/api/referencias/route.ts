import { responder, rota } from "@/lib/http";
import { listarReferencias } from "@/modules/referencias/referencias.service";

/** Domínios de valores (papéis, status, tipos). Público: não contém dados sensíveis. */
export const GET = rota(async () => {
  return responder(await listarReferencias(), 200, { "Cache-Control": "public, max-age=300" });
});
