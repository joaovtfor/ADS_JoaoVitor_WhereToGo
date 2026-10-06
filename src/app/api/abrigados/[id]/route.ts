import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, lerParametros, responder, rota } from "@/lib/http";
import { parametrosId } from "@/lib/validacao";
import { atualizarAbrigado, esquemaAtualizarAbrigado, obterAbrigado } from "@/modules/abrigados/abrigados.service";

export const GET = rota<{ id: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id } = await lerParametros(contexto, parametrosId);
  return responder(await obterAbrigado(ctx, id), 200, { "Cache-Control": "no-store" });
});

/** Corrige dados cadastrais (nome, CPF, nascimento). */
export const PATCH = rota<{ id: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id } = await lerParametros(contexto, parametrosId);
  return responder(await atualizarAbrigado(ctx, id, await lerCorpo(req, esquemaAtualizarAbrigado)));
});
