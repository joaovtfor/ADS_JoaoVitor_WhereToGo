import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, lerParametros, responder, rota } from "@/lib/http";
import { parametrosId } from "@/lib/validacao";
import { atualizarEvento, esquemaAtualizarEvento } from "@/modules/relatorios/eventos.service";

/** Ajusta ou encerra (com `fim`) um evento de desastre. */
export const PATCH = rota<{ id: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id } = await lerParametros(contexto, parametrosId);
  return responder(await atualizarEvento(ctx, id, await lerCorpo(req, esquemaAtualizarEvento)));
});
