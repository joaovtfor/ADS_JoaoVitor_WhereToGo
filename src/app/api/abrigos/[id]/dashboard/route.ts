import { exigirContexto } from "@/lib/auth/sessao";
import { lerParametros, responder, rota } from "@/lib/http";
import { parametrosId } from "@/lib/validacao";
import { obterDashboard } from "@/modules/abrigos/abrigos.service";

/** RF04 - dashboard de triagem (lotação, itens críticos, infraestrutura). */
export const GET = rota<{ id: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id } = await lerParametros(contexto, parametrosId);
  return responder(await obterDashboard(ctx, id), 200, { "Cache-Control": "no-store" });
});
