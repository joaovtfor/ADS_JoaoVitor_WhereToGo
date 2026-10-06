import { exigirContexto } from "@/lib/auth/sessao";
import { lerCorpo, lerQuery, responder, rota } from "@/lib/http";
import { esquemaPaginacao } from "@/lib/validacao";
import {
  criarUsuario,
  esquemaCriarUsuario,
  esquemaFiltroUsuarios,
  listarUsuarios,
} from "@/modules/usuarios/usuarios.service";

/** RF11 - usuários (ADMIN: todos; COORDENADOR: os do próprio abrigo). Query: papel, idAbrigo, ativo, busca */
export const GET = rota(async (req) => {
  const ctx = await exigirContexto(req);
  const filtros = lerQuery(req, esquemaFiltroUsuarios.extend(esquemaPaginacao.shape));
  return responder(await listarUsuarios(ctx, filtros, filtros));
});

/** RF11 - ADMIN cria qualquer perfil; COORDENADOR cria voluntários do próprio abrigo. */
export const POST = rota(async (req) => {
  const ctx = await exigirContexto(req);
  return responder(await criarUsuario(ctx, await lerCorpo(req, esquemaCriarUsuario)), 201);
});
