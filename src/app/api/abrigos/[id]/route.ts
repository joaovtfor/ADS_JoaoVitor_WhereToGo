import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, lerParametros, responder, rota } from "@/lib/http";
import { parametrosId } from "@/lib/validacao";
import { atualizarAbrigo, esquemaAtualizarAbrigo, obterAbrigo } from "@/modules/abrigos/abrigos.service";

export const GET = rota<{ id: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id } = await lerParametros(contexto, parametrosId);
  return responder(await obterAbrigo(ctx, id));
});

/** ADMIN: qualquer campo (inclusive `ativo`). COORDENADOR: telefone e capacidade do próprio abrigo. */
export const PATCH = rota<{ id: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id } = await lerParametros(contexto, parametrosId);
  return responder(await atualizarAbrigo(ctx, id, await lerCorpo(req, esquemaAtualizarAbrigo)));
});
