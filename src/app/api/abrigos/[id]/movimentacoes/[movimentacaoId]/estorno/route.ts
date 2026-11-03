import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, lerParametros, responder, rota } from "@/lib/http";
import { esquemaId, z } from "@/lib/validacao";
import { esquemaEstorno, estornarMovimentacao } from "@/modules/estoque/estoque.service";

const parametros = z.object({ id: esquemaId, movimentacaoId: esquemaId });

/** "Desfazer" do Fast-CRUD: estorna a movimentação (tipo ESTORNO com quantidade oposta). */
export const POST = rota<{ id: string; movimentacaoId: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id, movimentacaoId } = await lerParametros(contexto, parametros);
  return responder(await estornarMovimentacao(ctx, id, movimentacaoId, await lerCorpo(req, esquemaEstorno)), 201);
});
