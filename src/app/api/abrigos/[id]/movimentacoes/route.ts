import { exigirContexto } from "@/lib/auth/sessao";
import { lerParametros, lerQuery, responder, rota } from "@/lib/http";
import { esquemaPaginacao, parametrosId } from "@/lib/validacao";
import { esquemaFiltroHistorico, listarMovimentacoes } from "@/modules/estoque/estoque.service";

/** Histórico do estoque. Query: idItem, tipo, de, ate, pagina, tamanho */
export const GET = rota<{ id: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id } = await lerParametros(contexto, parametrosId);
  const filtros = lerQuery(req, esquemaFiltroHistorico.extend(esquemaPaginacao.shape));
  return responder(await listarMovimentacoes(ctx, id, filtros, filtros));
});
