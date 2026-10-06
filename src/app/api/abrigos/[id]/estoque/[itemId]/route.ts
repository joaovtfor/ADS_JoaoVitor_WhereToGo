import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, lerParametros, responder, rota } from "@/lib/http";
import { esquemaId, z } from "@/lib/validacao";
import { classificarItem, esquemaClassificacao } from "@/modules/estoque/estoque.service";

const parametros = z.object({ id: esquemaId, itemId: esquemaId });

/** RF03 - status de necessidade (URGENTE/NORMAL/BLOQUEADO) e estoque mínimo do item no abrigo. */
export const PATCH = rota<{ id: string; itemId: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id, itemId } = await lerParametros(contexto, parametros);
  return responder(await classificarItem(ctx, id, itemId, await lerCorpo(req, esquemaClassificacao)));
});
