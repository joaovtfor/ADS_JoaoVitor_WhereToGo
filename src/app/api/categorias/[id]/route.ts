import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, lerParametros, responder, rota } from "@/lib/http";
import { parametrosId } from "@/lib/validacao";
import { atualizarCategoria, esquemaAtualizarCategoria } from "@/modules/catalogo/catalogo.service";

export const PATCH = rota<{ id: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id } = await lerParametros(contexto, parametrosId);
  return responder(await atualizarCategoria(ctx, id, await lerCorpo(req, esquemaAtualizarCategoria)));
});
