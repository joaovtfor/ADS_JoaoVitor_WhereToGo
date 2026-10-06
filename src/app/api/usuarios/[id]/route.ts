import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, lerParametros, responder, rota } from "@/lib/http";
import { parametrosId } from "@/lib/validacao";
import { atualizarUsuario, esquemaAtualizarUsuario, obterUsuario } from "@/modules/usuarios/usuarios.service";

export const GET = rota<{ id: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id } = await lerParametros(contexto, parametrosId);
  return responder(await obterUsuario(ctx, id));
});

/** Atualiza usuário. Desativação substitui exclusão (preserva a autoria nos logs). */
export const PATCH = rota<{ id: string }>(async (req, contexto) => {
  const ctx = await exigirContexto(req);
  const { id } = await lerParametros(contexto, parametrosId);
  return responder(await atualizarUsuario(ctx, id, await lerCorpo(req, esquemaAtualizarUsuario)));
});
