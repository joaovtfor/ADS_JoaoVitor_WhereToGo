import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, lerParametros, responder, rota } from "@/lib/http";
import { esquemaId, z } from "@/lib/validacao";
import { esquemaMovimentacao, movimentarEstoque } from "@/modules/estoque/estoque.service";

const parametros = z.object({ id: esquemaId, itemId: esquemaId });

/**
 * RF02 - Fast-CRUD: `{ "quantidade": 1 }` / `{ "quantidade": -1 }`.
 * Tipos: ENTRADA_DOACAO, SAIDA_CONSUMO, PERDA e AJUSTE (coordenador).
 */
export const POST = rota<{ id: string; itemId: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id, itemId } = await lerParametros(contexto, parametros);
  const resultado = await movimentarEstoque(ctx, id, itemId, await lerCorpo(req, esquemaMovimentacao));
  return responder(resultado, resultado.movimentacao ? 201 : 200);
});
