import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, lerParametros, responder, rota } from "@/lib/http";
import { parametrosId } from "@/lib/validacao";
import { atualizarItem, esquemaAtualizarItem } from "@/modules/catalogo/catalogo.service";

/** Atualiza item (ADMIN). Itens não são excluídos: use `ativo: false`. */
export const PATCH = rota<{ id: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id } = await lerParametros(contexto, parametrosId);
  return responder(await atualizarItem(ctx, id, await lerCorpo(req, esquemaAtualizarItem)));
});
