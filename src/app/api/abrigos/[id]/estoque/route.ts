import { exigirContexto } from "@/lib/auth/sessao";
import { lerParametros, lerQuery, responder, rota } from "@/lib/http";
import { parametrosId } from "@/lib/validacao";
import { esquemaFiltroEstoque, listarEstoque } from "@/modules/estoque/estoque.service";

/** Estoque do abrigo. Query: categoria (slug), incluirCatalogo=true (itens ainda sem saldo). */
export const GET = rota<{ id: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id } = await lerParametros(contexto, parametrosId);
  return responder(await listarEstoque(ctx, id, lerQuery(req, esquemaFiltroEstoque)), 200, {
    "Cache-Control": "no-store",
  });
});
