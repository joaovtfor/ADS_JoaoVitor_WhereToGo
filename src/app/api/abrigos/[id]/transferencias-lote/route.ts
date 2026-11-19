import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, lerParametros, responder, rota } from "@/lib/http";
import { parametrosId } from "@/lib/validacao";
import { esquemaTransferenciaLote, transferirAbrigadosEmLote } from "@/modules/abrigados/abrigados.service";

/**
 * Transfere várias pessoas deste abrigo para outro, tudo ou nada
 * (evacuação preventiva). `{ idsAbrigados, idAbrigoDestino, motivo }`.
 */
export const POST = rota<{ id: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id } = await lerParametros(contexto, parametrosId);
  return responder(await transferirAbrigadosEmLote(ctx, id, await lerCorpo(req, esquemaTransferenciaLote)), 201);
});
