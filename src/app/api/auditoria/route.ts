import { exigirContexto } from "@/lib/auth/sessao";
import { lerQuery, responder, rota } from "@/lib/http";
import { esquemaPaginacao } from "@/lib/validacao";
import { esquemaFiltroAuditoria, listarLogs } from "@/modules/auditoria/auditoria.service";

/** RF13 - logs de auditoria imutáveis. Query: idUsuario, idAbrigo, acao, de, ate, pagina, tamanho */
export const GET = rota(async (req) => {
  const ctx = await exigirContexto(req);
  const filtros = lerQuery(req, esquemaFiltroAuditoria.extend(esquemaPaginacao.shape));
  return responder(await listarLogs(ctx, filtros, filtros), 200, { "Cache-Control": "no-store" });
});
