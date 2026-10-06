import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, lerParametros, responder, rota } from "@/lib/http";
import { parametrosId } from "@/lib/validacao";
import { esquemaTransferenciaEstoque, transferirEstoque } from "@/modules/estoque/estoque.service";

/** Transfere itens deste abrigo (origem) para outro abrigo (COORDENADOR da origem). */
export const POST = rota<{ id: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id } = await lerParametros(contexto, parametrosId);
  return responder(await transferirEstoque(ctx, id, await lerCorpo(req, esquemaTransferenciaEstoque)), 201);
});
