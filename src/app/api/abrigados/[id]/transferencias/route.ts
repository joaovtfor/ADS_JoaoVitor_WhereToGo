import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, lerParametros, responder, rota } from "@/lib/http";
import { parametrosId } from "@/lib/validacao";
import {
  esquemaTransferenciaAbrigado,
  listarTransferencias,
  transferirAbrigado,
} from "@/modules/abrigados/abrigados.service";

/** Histórico de transferências do abrigado. */
export const GET = rota<{ id: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id } = await lerParametros(contexto, parametrosId);
  return responder(await listarTransferencias(ctx, id));
});

/** Transfere o abrigado para outro abrigo com vaga (COORDENADOR da origem ou ADMIN). */
export const POST = rota<{ id: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id } = await lerParametros(contexto, parametrosId);
  return responder(await transferirAbrigado(ctx, id, await lerCorpo(req, esquemaTransferenciaAbrigado)), 201);
});
